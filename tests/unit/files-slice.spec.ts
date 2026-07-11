import { beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("FilesSlice", () => {
	beforeEach(() => {
		browsergentStore.getState().clearFiles();
	});

	test("setFileNodes replaces nodes and rootIds", () => {
		const nodes = [
			{
				id: "f1",
				name: "a.txt",
				path: "/p/a.txt",
				kind: "file" as const,
				size: 1,
				mime: "text/plain",
			},
			{
				id: "f2",
				name: "b.txt",
				path: "/p/b.txt",
				kind: "file" as const,
				size: 2,
				mime: "text/plain",
			},
		];
		browsergentStore.getState().setFileNodes(nodes);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual(["f1", "f2"]);
		expect(state.nodes.f1).toEqual(nodes[0]);
		expect(state.nodes.f2).toEqual(nodes[1]);
		expect(state.selectedFileId).toBeNull();
	});

	test("setFileNodes with empty array clears state", () => {
		browsergentStore.getState().addFileNode({
			id: "f1",
			name: "a.txt",
			path: "/p/a.txt",
			kind: "file",
			size: 1,
			mime: "text/plain",
		});
		expect(browsergentStore.getState().files.rootIds.length).toBe(1);
		browsergentStore.getState().setFileNodes([]);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual([]);
		expect(Object.keys(state.nodes)).toEqual([]);
		expect(state.selectedFileId).toBeNull();
	});

	test("incrementFilesVersion bumps counter without touching nodes", () => {
		browsergentStore.getState().setFileNodes([
			{
				id: "f1",
				name: "a.txt",
				path: "/a.txt",
				kind: "file",
				size: 1,
				mime: "text/plain",
			},
		]);
		const before = browsergentStore.getState().files.filesVersion;
		browsergentStore.getState().incrementFilesVersion();
		const after = browsergentStore.getState().files;
		expect(after.filesVersion).toBe(before + 1);
		expect(Object.keys(after.nodes)).toEqual(["f1"]);
		expect(after.rootIds).toEqual(["f1"]);
	});

	test("setFileNodes preserves directory nodes with parentId", () => {
		const nodes = [
			{ id: "/sub", name: "sub", path: "/sub", kind: "directory" as const },
			{
				id: "/sub/a.txt",
				name: "a.txt",
				path: "/sub/a.txt",
				kind: "file" as const,
				parentId: "/sub",
			},
		];
		browsergentStore.getState().setFileNodes(nodes);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual(["/sub"]);
		expect(state.nodes["/sub"]).toEqual(nodes[0]);
		expect(state.nodes["/sub/a.txt"]).toEqual(nodes[1]);
		expect(state.loadedDirPaths).toEqual(["/", "/sub"]);
	});

	test("expandedFolderIds starts empty", () => {
		expect(browsergentStore.getState().files.expandedFolderIds).toEqual([]);
	});

	test("loadedDirPaths starts empty", () => {
		expect(browsergentStore.getState().files.loadedDirPaths).toEqual([]);
	});

	test("toggleFolderExpanded adds folder id when not present", () => {
		browsergentStore.getState().toggleFolderExpanded("/sub");
		expect(browsergentStore.getState().files.expandedFolderIds).toEqual([
			"/sub",
		]);
	});

	test("toggleFolderExpanded removes folder id when already present", () => {
		browsergentStore.getState().toggleFolderExpanded("/sub");
		browsergentStore.getState().toggleFolderExpanded("/other");
		expect(browsergentStore.getState().files.expandedFolderIds).toEqual([
			"/sub",
			"/other",
		]);
		browsergentStore.getState().toggleFolderExpanded("/sub");
		expect(browsergentStore.getState().files.expandedFolderIds).toEqual([
			"/other",
		]);
	});

	test("toggleFolderExpanded preserves other state", () => {
		browsergentStore
			.getState()
			.setFileNodes([
				{ id: "f1", name: "a.txt", path: "/a.txt", kind: "file", size: 1 },
			]);
		browsergentStore.getState().toggleFolderExpanded("/sub");
		const state = browsergentStore.getState().files;
		expect(state.nodes.f1).toBeDefined();
		expect(state.rootIds).toEqual(["f1"]);
		expect(state.expandedFolderIds).toEqual(["/sub"]);
	});

	test("setDirectoryChildren merges root without clearing other branches once nested", () => {
		// Load root: /notes (dir) + /readme.txt
		browsergentStore.getState().setDirectoryChildren(null, [
			{ id: "/notes", name: "notes", path: "/notes", kind: "directory" },
			{
				id: "/readme.txt",
				name: "readme.txt",
				path: "/readme.txt",
				kind: "file",
			},
		]);
		// Expand /notes: add children
		browsergentStore.getState().setDirectoryChildren("/notes", [
			{
				id: "/notes/a.md",
				name: "a.md",
				path: "/notes/a.md",
				kind: "file",
				parentId: "/notes",
			},
			{
				id: "/notes/sub",
				name: "sub",
				path: "/notes/sub",
				kind: "directory",
				parentId: "/notes",
			},
		]);
		// Expand /notes/sub
		browsergentStore.getState().setDirectoryChildren("/notes/sub", [
			{
				id: "/notes/sub/deep.txt",
				name: "deep.txt",
				path: "/notes/sub/deep.txt",
				kind: "file",
				parentId: "/notes/sub",
			},
		]);

		// Refresh only /notes children — must not wipe /readme.txt
		browsergentStore.getState().setDirectoryChildren("/notes", [
			{
				id: "/notes/a.md",
				name: "a.md",
				path: "/notes/a.md",
				kind: "file",
				parentId: "/notes",
			},
			{
				id: "/notes/b.md",
				name: "b.md",
				path: "/notes/b.md",
				kind: "file",
				parentId: "/notes",
			},
		]);

		const state = browsergentStore.getState().files;
		expect(state.nodes["/readme.txt"]).toBeDefined();
		expect(state.nodes["/notes/a.md"]).toBeDefined();
		expect(state.nodes["/notes/b.md"]).toBeDefined();
		// Old sub tree under /notes was replaced
		expect(state.nodes["/notes/sub"]).toBeUndefined();
		expect(state.nodes["/notes/sub/deep.txt"]).toBeUndefined();
		expect(state.loadedDirPaths).toContain("/");
		expect(state.loadedDirPaths).toContain("/notes");
		expect(state.loadedDirPaths).not.toContain("/notes/sub");
	});

	test("setDirectoryChildren for root replaces rootIds only", () => {
		browsergentStore
			.getState()
			.setDirectoryChildren(null, [
				{ id: "/a", name: "a", path: "/a", kind: "directory" },
			]);
		browsergentStore.getState().setDirectoryChildren("/a", [
			{
				id: "/a/x.txt",
				name: "x.txt",
				path: "/a/x.txt",
				kind: "file",
				parentId: "/a",
			},
		]);
		browsergentStore
			.getState()
			.setDirectoryChildren(null, [
				{ id: "/b", name: "b", path: "/b", kind: "directory" },
			]);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual(["/b"]);
		expect(state.nodes["/a"]).toBeUndefined();
		expect(state.nodes["/a/x.txt"]).toBeUndefined();
		expect(state.nodes["/b"]).toBeDefined();
		expect(state.loadedDirPaths).toEqual(["/"]);
	});

	test("setDirectoryChildren preserves selectedFileId when still present", () => {
		browsergentStore.getState().setDirectoryChildren(null, [
			{
				id: "/keep.txt",
				name: "keep.txt",
				path: "/keep.txt",
				kind: "file",
			},
			{
				id: "/gone.txt",
				name: "gone.txt",
				path: "/gone.txt",
				kind: "file",
			},
		]);
		browsergentStore.getState().setSelectedFileId("/keep.txt");
		browsergentStore.getState().setDirectoryChildren(null, [
			{
				id: "/keep.txt",
				name: "keep.txt",
				path: "/keep.txt",
				kind: "file",
			},
		]);
		expect(browsergentStore.getState().files.selectedFileId).toBe("/keep.txt");
	});
});
