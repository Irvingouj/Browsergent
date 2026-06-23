import { describe, expect, test, vi } from "vitest";
import type { FilesController } from "../../src/controllers/files-controller";
import { handleFileOp } from "../../src/sidepanel/file-op-handler";
import type { FileNode } from "../../src/state/slices/files-slice";

function makeFileNode(
	overrides: Partial<FileNode> & { name: string; path: string },
): FileNode {
	return {
		id: overrides.path,
		kind: "file",
		...overrides,
	};
}

function makeDirNode(
	overrides: Partial<FileNode> & { name: string; path: string },
): FileNode {
	return {
		id: overrides.path,
		kind: "directory",
		...overrides,
	};
}

describe("handleFileOp list", () => {
	test("list with NO prefix returns ALL files; each entry has path and name", async () => {
		const allFiles: FileNode[] = [
			makeFileNode({
				name: "a.md",
				path: "/user/a.md",
				size: 100,
				mime: "text/markdown",
			}),
			makeFileNode({
				name: "b.txt",
				path: "/user/b.txt",
				size: 200,
				mime: "text/plain",
			}),
		];

		const filesController = {
			listAllFiles: vi.fn().mockResolvedValue(allFiles),
			listDirectChildren: vi.fn(),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t1", op: { op: "list" } },
			filesController,
		);

		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("expected list result");

		expect(result.files).toHaveLength(2);

		for (const entry of result.files) {
			expect(entry).toHaveProperty("path");
			expect(entry).toHaveProperty("name");
			expect(entry).toHaveProperty("id");
			expect(entry).toHaveProperty("size");
			expect(entry).toHaveProperty("mime");
			expect(entry).toHaveProperty("isText");
			expect(entry.path.startsWith("/")).toBe(true);
		}

		expect(result.files[0].path).toBe("/user/a.md");
		expect(result.files[0].name).toBe("a.md");
		expect(result.files[1].path).toBe("/user/b.txt");
		expect(result.files[1].name).toBe("b.txt");
	});

	test("list with prefix=/user returns ONLY direct children (one level deep)", async () => {
		const directChildren: FileNode[] = [
			makeFileNode({ name: "a.md", path: "/user/a.md", size: 10 }),
			makeFileNode({ name: "b.txt", path: "/user/b.txt", size: 20 }),
			makeDirNode({ name: "sub", path: "/user/sub" }),
		];

		const filesController = {
			listAllFiles: vi.fn(),
			listDirectChildren: vi.fn().mockResolvedValue(directChildren),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t2", op: { op: "list", prefix: "/user" } },
			filesController,
		);

		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("expected list result");

		// Should NOT have called listAllFiles
		expect(filesController.listAllFiles).not.toHaveBeenCalled();
		expect(filesController.listDirectChildren).toHaveBeenCalledWith("/user");

		expect(result.files).toHaveLength(3);

		const paths = result.files.map((f) => f.path).sort();
		expect(paths).toEqual(["/user/a.md", "/user/b.txt", "/user/sub"]);

		// Subdirectory entry
		const subEntry = result.files.find((f) => f.name === "sub");
		expect(subEntry).toBeDefined();
		expect(subEntry!.path).toBe("/user/sub");

		// Every entry has path starting with "/"
		for (const entry of result.files) {
			expect(entry.path.startsWith("/")).toBe(true);
		}
	});

	test("list with prefix=/user does NOT return grandchildren from subdirectories", async () => {
		// Simulate /user has a.md (file) + sub/ (directory)
		// listDirectChildren should only return a.md and sub
		const directChildren: FileNode[] = [
			makeFileNode({ name: "a.md", path: "/user/a.md", size: 10 }),
			makeDirNode({ name: "sub", path: "/user/sub" }),
		];

		const filesController = {
			listAllFiles: vi.fn(),
			listDirectChildren: vi.fn().mockResolvedValue(directChildren),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t3", op: { op: "list", prefix: "/user" } },
			filesController,
		);

		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("expected list result");

		const names = result.files.map((f) => f.name).sort();
		expect(names).toEqual(["a.md", "sub"]);

		// No b.md from /user/sub/b.md
		expect(result.files.find((f) => f.name === "b.md")).toBeUndefined();

		// All entries have full path
		for (const entry of result.files) {
			expect(entry.path.startsWith("/user/")).toBe(true);
		}
	});

	test("list with empty string prefix behaves like no prefix (calls listAllFiles)", async () => {
		const allFiles: FileNode[] = [
			makeFileNode({ name: "readme.md", path: "/readme.md", size: 42 }),
		];

		const filesController = {
			listAllFiles: vi.fn().mockResolvedValue(allFiles),
			listDirectChildren: vi.fn(),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t4", op: { op: "list", prefix: "" } },
			filesController,
		);

		expect(filesController.listAllFiles).toHaveBeenCalled();
		expect(filesController.listDirectChildren).not.toHaveBeenCalled();

		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("expected list result");
		expect(result.files).toHaveLength(1);
		expect(result.files[0].path).toBe("/readme.md");
		expect(result.files[0].name).toBe("readme.md");
	});

	test("each returned FileOpListEntry has path field as first TSV column shape", async () => {
		const allFiles: FileNode[] = [
			makeFileNode({
				name: "doc.md",
				path: "/doc.md",
				size: 5,
				mime: "text/markdown",
			}),
		];

		const filesController = {
			listAllFiles: vi.fn().mockResolvedValue(allFiles),
			listDirectChildren: vi.fn(),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t5", op: { op: "list" } },
			filesController,
		);

		expect(result.op).toBe("list");
		if (result.op !== "list") throw new Error("expected list result");

		const entry = result.files[0];
		// Verify all required fields exist with correct types
		expect(typeof entry.path).toBe("string");
		expect(typeof entry.name).toBe("string");
		expect(typeof entry.id).toBe("string");
		expect(typeof entry.size).toBe("number");
		expect(typeof entry.mime).toBe("string");
		expect(typeof entry.isText).toBe("boolean");

		expect(entry.path).toBe("/doc.md");
		expect(entry.name).toBe("doc.md");
	});

	test("list normalizes trailing-slash prefix before listing", async () => {
		// prefix "/user/" should be normalized to "/user" so listDirectChildren
		// produces clean "/user/a.md" paths, not "/user//a.md".
		const directChildren: FileNode[] = [
			makeFileNode({ name: "a.md", path: "/user/a.md" }),
		];

		const filesController = {
			listAllFiles: vi.fn(),
			listDirectChildren: vi.fn().mockResolvedValue(directChildren),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t6", op: { op: "list", prefix: "/user/" } },
			filesController,
		);

		expect(filesController.listDirectChildren).toHaveBeenCalledWith("/user");
		expect(result.files[0].path).toBe("/user/a.md");
	});

	test("list normalizes root-slash prefix to root", async () => {
		// prefix "/" should list root, not be treated as "no prefix" (which
		// would recursively list everything).
		const rootChildren: FileNode[] = [
			makeFileNode({ name: "top.md", path: "/top.md" }),
		];

		const filesController = {
			listAllFiles: vi.fn(),
			listDirectChildren: vi.fn().mockResolvedValue(rootChildren),
		} as unknown as FilesController;

		const result = await handleFileOp(
			{ id: "t7", op: { op: "list", prefix: "/" } },
			filesController,
		);

		expect(filesController.listDirectChildren).toHaveBeenCalledWith("/");
		expect(filesController.listAllFiles).not.toHaveBeenCalled();
		expect(result.files[0].path).toBe("/top.md");
	});
});
