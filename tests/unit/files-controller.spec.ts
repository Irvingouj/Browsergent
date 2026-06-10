import { beforeEach, describe, expect, test } from "vitest";
import type { SkillFsClient } from "../../src/skills/skill-types";
import {
	buildFileNode,
	buildOpfsPath,
	FilesController,
	isTextFile,
	sanitizeFileName,
} from "../../src/controllers/files-controller";

interface MockFs extends SkillFsClient {
	storage: Map<string, string>;
	logs: string[];
}

function createMockFs(): MockFs {
	const storage = new Map<string, string>();
	const logs: string[] = [];
	return {
		storage,
		logs,
		async fsExists(path: string): Promise<boolean> {
			logs.push(`exists:${path}`);
			return storage.has(path);
		},
		async fsList(path: string): Promise<{ name: string; kind: string }[]> {
			logs.push(`list:${path}`);
			const entries: { name: string; kind: string }[] = [];
			const prefix = path.endsWith("/") ? path : `${path}/`;
			for (const key of storage.keys()) {
				if (key.startsWith(prefix)) {
					const rest = key.slice(prefix.length);
					const name = rest.split("/")[0];
					if (name && !entries.find((e) => e.name === name)) {
						entries.push({ name, kind: "file" });
					}
				}
			}
			return entries;
		},
		async fsReadText(path: string): Promise<string> {
			logs.push(`read:${path}`);
			const data = storage.get(path);
			if (data === undefined) throw new Error(`Not found: ${path}`);
			return data;
		},
		async fsWriteText(path: string, data: string): Promise<void> {
			logs.push(`write:${path}`);
			storage.set(path, data);
		},
		async fsMkdir(path: string): Promise<void> {
			logs.push(`mkdir:${path}`);
			storage.set(path, "__DIR__");
		},
		async fsDelete(path: string): Promise<void> {
			logs.push(`delete:${path}`);
			storage.delete(path);
		},
	};
}

describe("sanitizeFileName", () => {
	test("removes forward slashes", () => {
		expect(sanitizeFileName("a/b/c.txt")).toBe("abc.txt");
	});

	test("removes backslashes", () => {
		expect(sanitizeFileName("a\\b\\c.txt")).toBe("abc.txt");
	});

	test("removes control characters", () => {
		expect(sanitizeFileName("a\x00b\x1fc\x7fd.txt")).toBe("abcd.txt");
	});

	test("preserves normal characters", () => {
		expect(sanitizeFileName("hello world-123_日本語.md")).toBe(
			"hello world-123_日本語.md",
		);
	});
});

describe("buildOpfsPath", () => {
	test("formats path correctly", () => {
		expect(buildOpfsPath("sess-1", "file-1", "name.txt")).toBe(
			"/session-files/sess-1/file-1-name.txt",
		);
	});

	test("handles names with spaces", () => {
		expect(buildOpfsPath("s1", "f1", "my file.md")).toBe(
			"/session-files/s1/f1-my file.md",
		);
	});

	test("sanitizes sessionId with path separators and dot-dot", () => {
		expect(buildOpfsPath("s1/../other", "f1", "name.txt")).toBe(
			"/session-files/s1other/f1-name.txt",
		);
	});
});

describe("isTextFile", () => {
	test("returns true for known text extensions", () => {
		expect(isTextFile("readme.md")).toBe(true);
		expect(isTextFile("data.txt")).toBe(true);
		expect(isTextFile("config.json")).toBe(true);
		expect(isTextFile("script.js")).toBe(true);
		expect(isTextFile("types.ts")).toBe(true);
		expect(isTextFile("page.jsx")).toBe(true);
		expect(isTextFile("page.tsx")).toBe(true);
		expect(isTextFile("style.css")).toBe(true);
		expect(isTextFile("index.html")).toBe(true);
	});

	test("returns false for binary extensions", () => {
		expect(isTextFile("image.png")).toBe(false);
		expect(isTextFile("archive.zip")).toBe(false);
		expect(isTextFile("document.pdf")).toBe(false);
		expect(isTextFile("app.exe")).toBe(false);
	});

	test("is case-insensitive", () => {
		expect(isTextFile("README.MD")).toBe(true);
		expect(isTextFile("README.md")).toBe(true);
		expect(isTextFile("IMAGE.PNG")).toBe(false);
	});
});

describe("buildFileNode", () => {
	test("creates file node from entry", () => {
		const entry = {
			id: "f1",
			name: "test.md",
			size: 100,
			mime: "text/markdown",
			isText: true,
			path: "/session-files/s1/f1-test.md",
		};
		const node = buildFileNode(entry);
		expect(node).toEqual({
			id: "f1",
			name: "test.md",
			path: "/session-files/s1/f1-test.md",
			kind: "file",
			size: 100,
			mime: "text/markdown",
		});
	});
});

describe("FilesController.uploadFiles", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
	});

	test("writes text files to OPFS and returns nodes", async () => {
		const file = new File(["hello world"], "test.md", {
			type: "text/markdown",
		});
		const nodes = await ctrl.uploadFiles("s1", [file]);

		expect(nodes.length).toBe(1);
		expect(nodes[0].name).toBe("test.md");
		expect(nodes[0].kind).toBe("file");
		expect(nodes[0].size).toBe(11);
		expect(nodes[0].mime).toBe("text/markdown");

		// File content written
		const filePath = nodes[0].path;
		expect(fs.storage.get(filePath)).toBe("hello world");

		// Index written
		const indexText = fs.storage.get("/session-files/s1/.index.json");
		expect(indexText).toBeDefined();
		const index = JSON.parse(indexText!);
		expect(index.version).toBe(1);
		expect(index.entries.length).toBe(1);
		expect(index.entries[0].name).toBe("test.md");
		expect(index.entries[0].isText).toBe(true);
	});

	test("stores binary metadata only without writing blob", async () => {
		const file = new File(["binarydata"], "image.png", {
			type: "image/png",
		});
		const nodes = await ctrl.uploadFiles("s1", [file]);

		expect(nodes.length).toBe(1);
		expect(nodes[0].name).toBe("image.png");

		// No file content written for binary
		const filePath = nodes[0].path;
		expect(fs.storage.has(filePath)).toBe(false);

		// Index has metadata
		const indexText = fs.storage.get("/session-files/s1/.index.json");
		const index = JSON.parse(indexText!);
		expect(index.entries[0].isText).toBe(false);
		expect(index.entries[0].size).toBe(10);
	});

	test("handles multiple files", async () => {
		const files = [
			new File(["a"], "a.md", { type: "text/markdown" }),
			new File(["b"], "b.png", { type: "image/png" }),
		];
		const nodes = await ctrl.uploadFiles("s1", files);

		expect(nodes.length).toBe(2);
		expect(nodes[0].name).toBe("a.md");
		expect(nodes[1].name).toBe("b.png");

		const indexText = fs.storage.get("/session-files/s1/.index.json");
		const index = JSON.parse(indexText!);
		expect(index.entries.length).toBe(2);
	});

	test("sanitizes names with slashes", async () => {
		const file = new File(["x"], "path/to/file.md", {
			type: "text/markdown",
		});
		const nodes = await ctrl.uploadFiles("s1", [file]);

		const filePath = nodes[0].path;
		expect(filePath.endsWith("-pathtofile.md")).toBe(true);
		expect(fs.storage.has(filePath)).toBe(true);
		expect(nodes[0].name).toBe("path/to/file.md");

		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		expect(index.entries[0].name).toBe("path/to/file.md");
	});

	test("rejects text files over size cap", async () => {
		const bigContent = "x".repeat(1_000_001);
		const file = new File([bigContent], "big.md", {
			type: "text/markdown",
		});
		await expect(ctrl.uploadFiles("s1", [file])).rejects.toThrow(
			"File too large",
		);
		// Should not have written the file or index
		expect(fs.storage.size).toBe(0);
	});

	test("rolls back partially uploaded text files on failure", async () => {
		const file1 = new File(["a"], "a.md", { type: "text/markdown" });
		const file2 = new File(["b"], "b.md", { type: "text/markdown" });

		// Make the second write fail by pre-populating its path
		const path2 = "/session-files/s1/" + "x".repeat(100) + "-b.md";
		// Actually, a simpler approach: make fsWriteText throw after first call
		let writeCount = 0;
		const originalWriteText = fs.fsWriteText.bind(fs);
		fs.fsWriteText = async (path: string, data: string) => {
			writeCount++;
			if (writeCount === 2) {
				throw new Error("disk full");
			}
			return originalWriteText(path, data);
		};

		await expect(ctrl.uploadFiles("s1", [file1, file2])).rejects.toThrow(
			"disk full",
		);

		// First file should have been cleaned up
		const keys = Array.from(fs.storage.keys());
		expect(keys.some((k) => k.endsWith("-a.md"))).toBe(false);
	});
});

describe("FilesController.readFileText", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(async () => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
		const file = new File(["content"], "test.md", {
			type: "text/markdown",
		});
		await ctrl.uploadFiles("s1", [file]);
	});

	test("returns text content for text files", async () => {
		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		const fileId = index.entries[0].id;

		const text = await ctrl.readFileText("s1", fileId);
		expect(text).toBe("content");
	});

	test("throws for non-existent file", async () => {
		await expect(ctrl.readFileText("s1", "bad-id")).rejects.toThrow(
			"File not found",
		);
	});

	test("throws for binary files", async () => {
		const file = new File(["bin"], "img.png", { type: "image/png" });
		await ctrl.uploadFiles("s1", [file]);
		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		const binaryId = index.entries.find((e: { name: string }) => e.name === "img.png").id;

		await expect(ctrl.readFileText("s1", binaryId)).rejects.toThrow(
			"File is not text",
		);
	});

	test("throws when index entry path is out of session scope", async () => {
		const file = new File(["content"], "test.md", {
			type: "text/markdown",
		});
		await ctrl.uploadFiles("s1", [file]);

		// Tamper with the index to point to another session
		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		index.entries[0].path = "/session-files/s2/f1-test.md";
		fs.storage.set("/session-files/s1/.index.json", JSON.stringify(index));

		await expect(ctrl.readFileText("s1", index.entries[0].id)).rejects.toThrow(
			"File path out of scope",
		);
	});
});

describe("FilesController.deleteFile", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(async () => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
		const file = new File(["content"], "test.md", {
			type: "text/markdown",
		});
		await ctrl.uploadFiles("s1", [file]);
	});

	test("removes text file from OPFS and index", async () => {
		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		const fileId = index.entries[0].id;
		const filePath = index.entries[0].path;

		expect(fs.storage.has(filePath)).toBe(true);

		await ctrl.deleteFile("s1", fileId);

		expect(fs.storage.has(filePath)).toBe(false);
		const newIndex = JSON.parse(
			fs.storage.get("/session-files/s1/.index.json")!,
		);
		expect(newIndex.entries.length).toBe(0);
	});

	test("throws for non-existent file", async () => {
		await expect(ctrl.deleteFile("s1", "bad-id")).rejects.toThrow(
			"File not found",
		);
	});

	test("throws when index entry path is out of session scope", async () => {
		const file = new File(["content"], "test.md", {
			type: "text/markdown",
		});
		await ctrl.uploadFiles("s1", [file]);

		// Tamper with the index to point to another session
		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		index.entries[0].path = "/session-files/s2/f1-test.md";
		fs.storage.set("/session-files/s1/.index.json", JSON.stringify(index));

		await expect(ctrl.deleteFile("s1", index.entries[0].id)).rejects.toThrow(
			"File path out of scope",
		);
	});

	test("removes binary file from index without deleting OPFS blob", async () => {
		const file = new File(["bin"], "img.png", { type: "image/png" });
		await ctrl.uploadFiles("s1", [file]);

		const indexText = fs.storage.get("/session-files/s1/.index.json")!;
		const index = JSON.parse(indexText);
		const binaryEntry = index.entries.find(
			(e: { name: string }) => e.name === "img.png",
		);
		expect(binaryEntry).toBeDefined();
		const fileId = binaryEntry.id;
		const filePath = binaryEntry.path;

		// Binary files are not stored in OPFS
		expect(fs.storage.has(filePath)).toBe(false);

		fs.logs = [];
		await ctrl.deleteFile("s1", fileId);

		// Should not have attempted to delete the non-existent blob path
		expect(
			fs.logs.some((l) => l.startsWith("delete:") && l.includes(filePath)),
		).toBe(false);

		const newIndex = JSON.parse(
			fs.storage.get("/session-files/s1/.index.json")!,
		);
		// The text file from beforeEach should still be present
		expect(newIndex.entries.length).toBe(1);
		expect(newIndex.entries[0].name).toBe("test.md");
	});
});

describe("FilesController.listSessionFiles", () => {
	test("returns empty array for new session", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		const nodes = await ctrl.listSessionFiles("new-session");
		expect(nodes).toEqual([]);
	});

	test("returns nodes for existing files", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		const file = new File(["x"], "a.md", { type: "text/markdown" });
		await ctrl.uploadFiles("s1", [file]);

		const nodes = await ctrl.listSessionFiles("s1");
		expect(nodes.length).toBe(1);
		expect(nodes[0].name).toBe("a.md");
		expect(nodes[0].kind).toBe("file");
	});

	test("handles corrupt index JSON gracefully", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		fs.storage.set("/session-files/s1/.index.json", "not json");

		const nodes = await ctrl.listSessionFiles("s1");
		expect(nodes).toEqual([]);

		await expect(ctrl.readFileText("s1", "any-id")).rejects.toThrow(
			"File not found",
		);
	});
});

describe("FilesController.syncIndexFromSnapshot", () => {
	test("writes OPFS index from snapshot nodes", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		const nodes = [
			{
				id: "f1",
				name: "notes.md",
				path: "/session-files/s1/f1-notes.md",
				kind: "file" as const,
				size: 12,
				mime: "text/markdown",
			},
			{
				id: "f2",
				name: "photo.png",
				path: "/session-files/s1/f2-photo.png",
				kind: "file" as const,
				size: 100,
				mime: "image/png",
			},
		];

		await ctrl.syncIndexFromSnapshot("s1", nodes);

		const indexText = fs.storage.get("/session-files/s1/.index.json");
		expect(indexText).toBeDefined();
		const index = JSON.parse(indexText!);
		expect(index.version).toBe(1);
		expect(index.entries).toHaveLength(2);
		expect(index.entries[0]).toMatchObject({
			id: "f1",
			name: "notes.md",
			isText: true,
		});
		expect(index.entries[1]).toMatchObject({
			id: "f2",
			name: "photo.png",
			isText: false,
		});
	});

	test("replaces stale OPFS index with snapshot entries", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		const staleFile = new File(["stale"], "old.md", { type: "text/markdown" });
		await ctrl.uploadFiles("s1", [staleFile]);

		const snapshotNodes = [
			{
				id: "new-id",
				name: "fresh.md",
				path: "/session-files/s1/new-id-fresh.md",
				kind: "file" as const,
				size: 5,
				mime: "text/markdown",
			},
		];
		await ctrl.syncIndexFromSnapshot("s1", snapshotNodes);

		const nodes = await ctrl.listSessionFiles("s1");
		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.id).toBe("new-id");
		expect(nodes[0]?.name).toBe("fresh.md");
	});

	test("filters out nodes whose path belongs to a different session", async () => {
			const fs = createMockFs();
			const ctrl = new FilesController(fs);
			const nodes = [
				{
					id: "f1",
					name: "notes.md",
					path: "/session-files/s1/f1-notes.md",
					kind: "file" as const,
					size: 12,
					mime: "text/markdown",
				},
				{
					id: "f2",
					name: "evil.png",
					path: "/session-files/s2/f2-evil.png",
					kind: "file" as const,
					size: 999,
					mime: "image/png",
				},
			];

			await ctrl.syncIndexFromSnapshot("s1", nodes);

			const indexText = fs.storage.get("/session-files/s1/.index.json");
			const index = JSON.parse(indexText!);
			expect(index.entries).toHaveLength(1);
			expect(index.entries[0].id).toBe("f1");
		});
	});

describe("FilesController.readIndex", () => {
	test("returns empty entries for unsupported version", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		fs.storage.set(
			"/session-files/s1/.index.json",
			JSON.stringify({ version: 2, entries: [{ id: "x" }] }),
		);

		const nodes = await ctrl.listSessionFiles("s1");
		expect(nodes).toEqual([]);
	});

	test("filters entries missing required string fields", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		fs.storage.set(
			"/session-files/s1/.index.json",
			JSON.stringify({
				version: 1,
				entries: [
					{ id: "f1", name: "good.md", path: "/session-files/s1/f1-good.md", size: 5, mime: "text/plain", isText: true },
					{ id: 123, name: "no-id.md", path: "/session-files/s1/x-no-id.md", size: 3, mime: "text/plain", isText: true },
					{ id: "f3", name: 456, path: "/session-files/s1/f3-no-name.md", size: 7, mime: "text/plain", isText: true },
					{ id: "f4", name: "no-path.md", size: 9, mime: "text/plain", isText: true },
				],
			}),
		);

		const nodes = await ctrl.listSessionFiles("s1");
		expect(nodes).toHaveLength(1);
		expect(nodes[0].id).toBe("f1");
		expect(nodes[0].name).toBe("good.md");
	});
});

describe("FilesController.cleanupSession", () => {
	test("deletes all files and directory", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		const file = new File(["x"], "a.md", { type: "text/markdown" });
		await ctrl.uploadFiles("s1", [file]);

		expect(fs.storage.size).toBeGreaterThan(0);

		await ctrl.cleanupSession("s1");

		// All session files should be gone
		for (const key of fs.storage.keys()) {
			expect(key.startsWith("/session-files/s1/")).toBe(false);
		}
	});

	test("succeeds when directory does not exist", async () => {
		const fs = createMockFs();
		const ctrl = new FilesController(fs);
		await expect(ctrl.cleanupSession("missing")).resolves.toBeUndefined();
	});
});
