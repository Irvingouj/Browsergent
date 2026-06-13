import { beforeEach, describe, expect, test } from "vitest";
import { handleFileOp } from "../../src/sidepanel/file-op-handler";
import type { FilesController } from "../../src/controllers/files-controller";

class FakeFilesController {
	storage = new Map<string, { content: string; isText: boolean }>();
	index = new Map<string, { id: string; name: string; isText: boolean }>();

	async listSessionFiles(): Promise<
		Array<{ id: string; name: string; size: number; mime: string }>
	> {
		return Array.from(this.index.values()).map((e) => {
			const data = this.storage.get(e.id);
			return {
				id: e.id,
				name: e.name,
				size: data?.content.length ?? 0,
				mime: e.isText ? "text/plain" : "application/octet-stream",
			};
		});
	}

	async readFileText(_sessionId: string, fileId: string): Promise<string> {
		const data = this.storage.get(fileId);
		if (!data) throw new Error("File not found");
		return data.content;
	}

	async editFile(
		_sessionId: string,
		fileId: string,
		oldString: string,
		newString: string,
		replaceAll: boolean,
	): Promise<{ occurrences: number; bytes: number }> {
		const data = this.storage.get(fileId);
		if (!data) throw new Error("File not found");
		if (!data.isText) throw new Error("File is not text");
		if (oldString === newString) throw new Error("old_string and new_string must differ");

		const occurrences = countOccurrences(data.content, oldString);
		if (occurrences === 0) throw new Error("old_string not found in file");
		if (occurrences > 1 && !replaceAll) {
			throw new Error(`old_string matches ${occurrences} times`);
		}

		const updated = replaceAll
			? data.content.split(oldString).join(newString)
			: data.content.replace(oldString, newString);
		this.storage.set(fileId, { ...data, content: updated });
		return { occurrences: replaceAll ? occurrences : 1, bytes: updated.length };
	}

	async deleteFile(_sessionId: string, fileId: string): Promise<void> {
		const entry = Array.from(this.index.entries()).find(([, v]) => v.id === fileId);
		if (!entry) throw new Error("File not found");
		this.index.delete(entry[0]);
		this.storage.delete(fileId);
	}

	addFile(name: string, content: string, isText = true): string {
		const id = `id-${name}`;
		this.index.set(name, { id, name, isText });
		this.storage.set(id, { content, isText });
		return id;
	}
}

function countOccurrences(haystack: string, needle: string): number {
	if (needle.length === 0) return 0;
	let count = 0;
	let i = 0;
	while ((i = haystack.indexOf(needle, i)) !== -1) {
		count++;
		i += needle.length;
	}
	return count;
}

describe("handleFileOp", () => {
	let ctrl: FakeFilesController;

	beforeEach(() => {
		ctrl = new FakeFilesController();
		ctrl.addFile("notes.md", "hello world");
		ctrl.addFile("data.json", '{"key": "value"}');
		ctrl.addFile("image.png", "binary", false);
	});

	test("list returns all files", async () => {
		const result = await handleFileOp(
			{ id: "r1", sessionId: "s1", op: { op: "list" } },
			ctrl as unknown as FilesController,
		);
		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("unreachable");
		expect(result.files).toHaveLength(3);
		expect(result.files.map((f) => f.name)).toEqual(
			expect.arrayContaining(["notes.md", "data.json", "image.png"]),
		);
	});

	test("list with prefix filters", async () => {
		const result = await handleFileOp(
			{ id: "r1", sessionId: "s1", op: { op: "list", prefix: "dat" } },
			ctrl as unknown as FilesController,
		);
		if (result.op !== "list") throw new Error("unreachable");
		expect(result.files).toHaveLength(1);
		expect(result.files[0].name).toBe("data.json");
	});

	test("read returns content of a text file", async () => {
		const result = await handleFileOp(
			{ id: "r1", sessionId: "s1", op: { op: "read", path: "notes.md" } },
			ctrl as unknown as FilesController,
		);
		if (result.op !== "read") throw new Error("unreachable");
		expect(result.content).toBe("hello world");
		expect(result.bytes).toBe("hello world".length);
	});

	test("read throws on missing file", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", sessionId: "s1", op: { op: "read", path: "missing.md" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("File not found in session");
	});

	test("read throws on binary file", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", sessionId: "s1", op: { op: "read", path: "image.png" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("binary");
	});

	test("edit applies replacement", async () => {
		const result = await handleFileOp(
			{
				id: "r1",
				sessionId: "s1",
				op: { op: "edit", path: "notes.md", oldString: "world", newString: "browser" },
			},
			ctrl as unknown as FilesController,
		);
		if (result.op !== "edit") throw new Error("unreachable");
		expect(result.occurrences).toBe(1);
		expect(result.bytes).toBe("hello browser".length);
	});

	test("delete removes the file", async () => {
		await handleFileOp(
			{ id: "r1", sessionId: "s1", op: { op: "delete", path: "notes.md" } },
			ctrl as unknown as FilesController,
		);
		const remaining = await ctrl.listSessionFiles();
		expect(remaining.find((f) => f.name === "notes.md")).toBeUndefined();
	});

	test("rejects path with ..", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", sessionId: "s1", op: { op: "read", path: "../etc/passwd" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});

	test("rejects absolute path", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", sessionId: "s1", op: { op: "read", path: "/etc/passwd" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});

	test("rejects backslash path", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", sessionId: "s1", op: { op: "read", path: "Windows\\system32" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});

	test("rejects path with null byte", async () => {
		await expect(
			handleFileOp(
				{ id: "r1", sessionId: "s1", op: { op: "read", path: "evil\0.md" } },
				ctrl as unknown as FilesController,
			),
		).rejects.toThrow("out of scope");
	});
});
