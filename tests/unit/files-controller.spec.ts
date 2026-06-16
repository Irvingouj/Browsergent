import { beforeEach, describe, expect, test } from "vitest";
import {
	buildFileNode,
	FilesController,
	isTextFile,
	sanitizeFileName,
} from "../../src/controllers/files-controller";
import type { SkillFsClient } from "../../src/skills/skill-types";

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
			if (storage.has(path)) return true;
			const prefix = path === "/" ? "/" : `${path}/`;
			for (const key of storage.keys()) {
				if (key.startsWith(prefix)) return true;
			}
			return false;
		},
		async fsList(path: string): Promise<{ name: string; kind: string }[]> {
			logs.push(`list:${path}`);
			const prefix = path === "/" ? "/" : `${path}/`;
			const seen = new Set<string>();
			const entries: { name: string; kind: string }[] = [];
			for (const key of storage.keys()) {
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
		async fsWriteBase64(path: string, base64: string): Promise<void> {
			logs.push(`writeBase64:${path}`);
			storage.set(path, base64);
		},
		async fsReadBase64(path: string): Promise<string> {
			logs.push(`readBase64:${path}`);
			const data = storage.get(path);
			if (data === undefined) throw new Error(`Not found: ${path}`);
			return data;
		},
		async fsMkdir(path: string): Promise<void> {
			logs.push(`mkdir:${path}`);
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
	test("sets id from path and kind to file", () => {
		const node = buildFileNode({ name: "test.md", path: "/test.md" });
		expect(node).toEqual({
			id: "/test.md",
			name: "test.md",
			path: "/test.md",
			kind: "file",
		});
	});

	test("includes size when provided", () => {
		const node = buildFileNode({ name: "a.txt", path: "/a.txt", size: 42 });
		expect(node.size).toBe(42);
	});

	test("includes mime when provided", () => {
		const node = buildFileNode({
			name: "a.txt",
			path: "/a.txt",
			mime: "text/plain",
		});
		expect(node.mime).toBe("text/plain");
	});

	test("omits size and mime when not provided", () => {
		const node = buildFileNode({ name: "b.ts", path: "/b.ts" });
		expect(node.size).toBeUndefined();
		expect(node.mime).toBeUndefined();
	});
});

describe("FilesController.uploadFiles", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
	});

	test("writes text files to /{name}", async () => {
		const file = new File(["hello world"], "test.md", {
			type: "text/markdown",
		});
		const nodes = await ctrl.uploadFiles([file]);

		expect(nodes.length).toBe(1);
		expect(nodes[0].name).toBe("test.md");
		expect(nodes[0].path).toBe("/test.md");
		expect(nodes[0].id).toBe("/test.md");
		expect(nodes[0].kind).toBe("file");
		expect(nodes[0].size).toBe(11);

		expect(fs.storage.get("/test.md")).toBe("hello world");
	});

	test("handles multiple files", async () => {
		const files = [
			new File(["a"], "alpha.md", { type: "text/markdown" }),
			new File(["b"], "beta.json", { type: "application/json" }),
		];
		const nodes = await ctrl.uploadFiles(files);

		expect(nodes.length).toBe(2);
		expect(nodes[0].name).toBe("alpha.md");
		expect(nodes[1].name).toBe("beta.json");
		expect(fs.storage.get("/alpha.md")).toBe("a");
		expect(fs.storage.get("/beta.json")).toBe("b");
	});

	test("writes binary files (e.g. PDF) as base64 with no size limit", async () => {
		const file = new File(["data"], "report.pdf", { type: "application/pdf" });
		const nodes = await ctrl.uploadFiles([file]);

		expect(nodes.length).toBe(1);
		expect(nodes[0].name).toBe("report.pdf");
		expect(nodes[0].path).toBe("/report.pdf");
		expect(nodes[0].size).toBe(4); // file.size in bytes
		expect(fs.logs).toContain("writeBase64:/report.pdf");
		expect(fs.storage.get("/report.pdf")).toBe("ZGF0YQ=="); // base64("data")
	});

	test("interprets slashes in name as subdirectory path", async () => {
		const file = new File(["x"], "path/to/file.md", {
			type: "text/markdown",
		});
		const nodes = await ctrl.uploadFiles([file]);

		expect(nodes[0].name).toBe("file.md");
		expect(nodes[0].path).toBe("/path/to/file.md");
		expect(nodes[0].parentId).toBe("/path/to");
		expect(fs.storage.get("/path/to/file.md")).toBe("x");
		expect(fs.logs).toContain("mkdir:/path");
		expect(fs.logs).toContain("mkdir:/path/to");
	});

	test("rejects names with .. path traversal segments", async () => {
		const file = new File(["x"], "../etc/passwd.md", {
			type: "text/markdown",
		});
		await expect(ctrl.uploadFiles([file])).rejects.toThrow("Invalid file name");
	});

	test("does not call mkdir for already-existing parent directories", async () => {
		fs.storage.set("/existing/.keep", "1"); // pre-create /existing dir via a sentinel file
		const file = new File(["x"], "existing/notes.md", {
			type: "text/markdown",
		});
		await ctrl.uploadFiles([file]);
		expect(fs.storage.get("/existing/notes.md")).toBe("x");
		// fsExists is called to check the dir; mkdir should NOT appear in logs for the existing dir
		expect(fs.logs).not.toContain("mkdir:/existing");
	});

	test("throws for empty name after sanitization", async () => {
		const file = new File(["x"], "///", { type: "text/markdown" });
		await expect(ctrl.uploadFiles([file])).rejects.toThrow("Invalid file name");
	});
});

describe("FilesController.listAllFiles", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
	});

	test("returns flat list of files at root", async () => {
		fs.storage.set("/a.txt", "aaa");
		fs.storage.set("/b.md", "bbb");

		const nodes = await ctrl.listAllFiles();
		expect(nodes.length).toBe(2);
		const names = nodes.map((n) => n.name).sort();
		expect(names).toEqual(["a.txt", "b.md"]);
		for (const node of nodes) {
			expect(node.kind).toBe("file");
			expect(node.id).toBe(node.path);
		}
	});

	test("recurses into subdirectories", async () => {
		fs.storage.set("/notes/draft.md", "draft");
		fs.storage.set("/notes/final.md", "final");
		fs.storage.set("/readme.txt", "hello");

		const nodes = await ctrl.listAllFiles();
		expect(nodes.length).toBe(4);
		const fileNames = nodes
			.filter((n) => n.kind === "file")
			.map((n) => n.name)
			.sort();
		expect(fileNames).toEqual(["draft.md", "final.md", "readme.txt"]);

		const draftNode = nodes.find((n) => n.name === "draft.md");
		expect(draftNode?.path).toBe("/notes/draft.md");
		expect(draftNode?.parentId).toBe("/notes");
		expect(draftNode?.kind).toBe("file");

		const dirNode = nodes.find((n) => n.kind === "directory");
		expect(dirNode?.path).toBe("/notes");
		expect(dirNode?.parentId).toBeUndefined();
	});

	test("returns empty array when root is empty", async () => {
		const nodes = await ctrl.listAllFiles();
		expect(nodes).toEqual([]);
	});

	test("returns empty array when fsList throws", async () => {
		fs.fsList = async () => {
			throw new Error("opfs error");
		};
		const nodes = await ctrl.listAllFiles();
		expect(nodes).toEqual([]);
	});
});

describe("FilesController.readFileText", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
	});

	test("returns text content", async () => {
		fs.storage.set("/hello.md", "hello world");
		const text = await ctrl.readFileText("/hello.md");
		expect(text).toBe("hello world");
	});

	test("throws for missing path", async () => {
		await expect(ctrl.readFileText("/nope.md")).rejects.toThrow("Not found");
	});
});

describe("FilesController.writeFile", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
	});

	test("creates a new file", async () => {
		await ctrl.writeFile("/new.txt", "fresh content");
		expect(fs.storage.get("/new.txt")).toBe("fresh content");
	});

	test("overwrites existing file", async () => {
		fs.storage.set("/existing.txt", "old");
		await ctrl.writeFile("/existing.txt", "new");
		expect(fs.storage.get("/existing.txt")).toBe("new");
	});
});

describe("FilesController.deleteFile", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
	});

	test("removes a file", async () => {
		fs.storage.set("/remove-me.md", "content");
		expect(fs.storage.has("/remove-me.md")).toBe(true);

		await ctrl.deleteFile("/remove-me.md");
		expect(fs.storage.has("/remove-me.md")).toBe(false);
	});

	test("succeeds when file does not exist (deletes no-op)", async () => {
		// fsDelete just calls storage.delete which is a no-op for missing keys
		await expect(ctrl.deleteFile("/ghost.txt")).resolves.toBeUndefined();
	});

	test("dispatches fsDelete for a directory path", async () => {
		fs.storage.set("/sub/a.md", "a");
		fs.storage.set("/sub/b.md", "b");

		await ctrl.deleteFile("/sub");

		// The real extension-js fsDelete handles directory recursion; the controller's
		// job is just to dispatch the call with the directory path. We assert the
		// dispatch, not the descendants' removal (which is the SDK's responsibility).
		expect(fs.logs).toContain("delete:/sub");
	});
});

describe("FilesController.editFile", () => {
	let fs: MockFs;
	let ctrl: FilesController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new FilesController(fs);
		fs.storage.set("/test.md", "hello world");
	});

	test("replaces a unique occurrence", async () => {
		const result = await ctrl.editFile("/test.md", "world", "browser", false);
		expect(result.occurrences).toBe(1);
		expect(result.bytes).toBe("hello browser".length);
		expect(fs.storage.get("/test.md")).toBe("hello browser");
	});

	test("replaces all occurrences when replace_all=true", async () => {
		fs.storage.set("/test.md", "x and x");
		const result = await ctrl.editFile("/test.md", "x", "y", true);
		expect(result.occurrences).toBe(2);
		expect(fs.storage.get("/test.md")).toBe("y and y");
	});

	test("throws when old_string not found", async () => {
		await expect(
			ctrl.editFile("/test.md", "missing", "x", false),
		).rejects.toThrow("not found in file");
	});

	test("throws when old_string matches multiple times without replace_all", async () => {
		fs.storage.set("/test.md", "x and x");
		await expect(ctrl.editFile("/test.md", "x", "y", false)).rejects.toThrow(
			"matches 2 times",
		);
	});

	test("throws when old_string equals new_string", async () => {
		await expect(
			ctrl.editFile("/test.md", "hello", "hello", false),
		).rejects.toThrow("must differ");
	});

	test("throws when old_string is empty", async () => {
		await expect(ctrl.editFile("/test.md", "", "x", false)).rejects.toThrow(
			"must not be empty",
		);
	});

	test("writes the new content and returns correct bytes", async () => {
		fs.storage.set("/test.md", "aaa bbb aaa");
		const result = await ctrl.editFile("/test.md", "aaa", "c", true);
		expect(result.occurrences).toBe(2);
		expect(result.bytes).toBe("c bbb c".length);
		expect(fs.storage.get("/test.md")).toBe("c bbb c");
	});
});
