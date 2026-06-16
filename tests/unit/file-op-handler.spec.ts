import { beforeEach, describe, expect, test } from "vitest";
import type { FilesController } from "../../src/controllers/files-controller";
import { handleFileOp } from "../../src/sidepanel/file-op-handler";
import type { FileNode } from "../../src/state/slices/files-slice";

class FakeFilesController {
	private storage = new Map<string, string>();

	async listAllFiles(): Promise<FileNode[]> {
		const entries = await this.fsList("/");
		const nodes: FileNode[] = [];
		for (const entry of entries) {
			const path = `/${entry.name}`;
			if (entry.kind === "file") {
				const content = this.storage.get(path);
				nodes.push({
					id: path,
					name: entry.name,
					path,
					kind: "file",
					size: content?.length ?? 0,
					mime: "text/plain",
				});
			}
		}
		return nodes;
	}

	async readFileText(path: string): Promise<string> {
		const content = this.storage.get(path);
		if (content === undefined) throw new Error("File not found");
		return content;
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.storage.set(path, content);
	}

	async deleteFile(path: string): Promise<void> {
		if (!this.storage.has(path)) throw new Error("File not found");
		this.storage.delete(path);
	}

	async editFile(
		path: string,
		oldString: string,
		newString: string,
		replaceAll: boolean,
	): Promise<{ occurrences: number; bytes: number }> {
		const content = this.storage.get(path);
		if (content === undefined) throw new Error("File not found");

		const occurrences = countOccurrences(content, oldString);
		if (occurrences === 0) throw new Error("old_string not found in file");
		if (occurrences > 1 && !replaceAll) {
			throw new Error(`old_string matches ${occurrences} times`);
		}

		const updated = replaceAll
			? content.split(oldString).join(newString)
			: content.replace(oldString, newString);
		this.storage.set(path, updated);
		return { occurrences: replaceAll ? occurrences : 1, bytes: updated.length };
	}

	private async fsList(
		path: string,
	): Promise<{ name: string; kind: string }[]> {
		const prefix = path === "/" ? "/" : `${path}/`;
		const seen = new Set<string>();
		const entries: { name: string; kind: string }[] = [];
		for (const key of this.storage.keys()) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			if (rest.length === 0) continue;
			const firstSeg = rest.split("/")[0] ?? "";
			if (rest.includes("/")) {
				if (!seen.has(firstSeg)) {
					seen.add(firstSeg);
					entries.push({ name: firstSeg, kind: "directory" });
				}
			} else {
				entries.push({ name: firstSeg, kind: "file" });
			}
		}
		return entries;
	}

	addFile(path: string, content: string): void {
		this.storage.set(path, content);
	}
}

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) return 0;
	let count = 0;
	let i = haystack.indexOf(needle);
	while (i !== -1) {
		count++;
		i = haystack.indexOf(needle, i + needle.length);
	}
	return count;
}

describe("handleFileOp", () => {
	let ctrl: FakeFilesController;

	beforeEach(() => {
		ctrl = new FakeFilesController();
		ctrl.addFile("/notes.md", "hello world");
		ctrl.addFile("/data.json", '{"key": "value"}');
		ctrl.addFile("/image.png", "binary");
	});

	test("list returns all files", async () => {
		const result = await handleFileOp(
			{ id: "r1", op: { op: "list" } },
			ctrl as unknown as FilesController,
		);
		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("unreachable");
		expect(result.files).toHaveLength(3);
		expect(result.files.map((f) => f.name)).toEqual(
			expect.arrayContaining(["notes.md", "data.json", "image.png"]),
		);
	});

	test("list with prefix filters by path", async () => {
		const result = await handleFileOp(
			{ id: "r1", op: { op: "list", prefix: "/dat" } },
			ctrl as unknown as FilesController,
		);
		if (result.op !== "list") throw new Error("unreachable");
		expect(result.files).toHaveLength(1);
		expect(result.files[0].name).toBe("data.json");
	});

	test("read returns content of a text file", async () => {
		const result = await handleFileOp(
			{ id: "r1", op: { op: "read", path: "/notes.md" } },
			ctrl as unknown as FilesController,
		);
		if (result.op !== "read") throw new Error("unreachable");
		expect(result.content).toBe("hello world");
		expect(result.bytes).toBe("hello world".length);
	});

	test("read throws on missing file", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", op: { op: "read", path: "/missing.md" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("File not found: /missing.md");
	});

	test("read throws on binary file", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", op: { op: "read", path: "/image.png" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("binary");
	});

	test("write creates a new file and returns byte count", async () => {
		const result = await handleFileOp(
			{ id: "r1", op: { op: "write", path: "/new.md", content: "hello" } },
			ctrl as unknown as FilesController,
		);
		expect(result.op).toBe("write");
		if (result.op !== "write") throw new Error("unreachable");
		expect(result.bytes).toBe(5);
		const content = await ctrl.readFileText("/new.md");
		expect(content).toBe("hello");
	});

	test("edit applies replacement", async () => {
		const result = await handleFileOp(
			{
				id: "r1",
				op: {
					op: "edit",
					path: "/notes.md",
					oldString: "world",
					newString: "browser",
				},
			},
			ctrl as unknown as FilesController,
		);
		if (result.op !== "edit") throw new Error("unreachable");
		expect(result.occurrences).toBe(1);
		expect(result.bytes).toBe("hello browser".length);
	});

	test("delete removes the file", async () => {
		await handleFileOp(
			{ id: "r1", op: { op: "delete", path: "/notes.md" } },
			ctrl as unknown as FilesController,
		);
		const remaining = await ctrl.listAllFiles();
		expect(remaining.find((f) => f.name === "notes.md")).toBeUndefined();
	});

	test("allows absolute path", async () => {
		const result = await handleFileOp(
			{ id: "r1", op: { op: "read", path: "/notes.md" } },
			ctrl as unknown as FilesController,
		);
		if (result.op !== "read") throw new Error("unreachable");
		expect(result.content).toBe("hello world");
	});

	test("rejects path with ..", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", op: { op: "read", path: "../etc/passwd" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});

	test("rejects path with backslash", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", op: { op: "read", path: "Windows\\system32" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});

	test("rejects path with null byte", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", op: { op: "read", path: "evil\0.md" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});
});
