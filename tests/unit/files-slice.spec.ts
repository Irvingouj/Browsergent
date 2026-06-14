import { beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("FilesSlice", () => {
	beforeEach(() => {
		browsergentStore.getState().clearFiles();
	});

	test("setFileNodes replaces nodes and rootIds", () => {
		const nodes = [
			{ id: "f1", name: "a.txt", path: "/p/a.txt", kind: "file" as const, size: 1, mime: "text/plain" },
			{ id: "f2", name: "b.txt", path: "/p/b.txt", kind: "file" as const, size: 2, mime: "text/plain" },
		];
		browsergentStore.getState().setFileNodes(nodes);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual(["f1", "f2"]);
		expect(state.nodes["f1"]).toEqual(nodes[0]);
		expect(state.nodes["f2"]).toEqual(nodes[1]);
		expect(state.selectedFileId).toBeNull();
	});

	test("setFileNodes with empty array clears state", () => {
		browsergentStore.getState().addFileNode({ id: "f1", name: "a.txt", path: "/p/a.txt", kind: "file", size: 1, mime: "text/plain" });
		expect(browsergentStore.getState().files.rootIds.length).toBe(1);
		browsergentStore.getState().setFileNodes([]);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual([]);
		expect(Object.keys(state.nodes)).toEqual([]);
		expect(state.selectedFileId).toBeNull();
	});

	test("incrementFilesVersion bumps counter without touching nodes", () => {
		browsergentStore.getState().setFileNodes([
			{ id: "f1", name: "a.txt", path: "/a.txt", kind: "file", size: 1, mime: "text/plain" },
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
			{ id: "/sub/a.txt", name: "a.txt", path: "/sub/a.txt", kind: "file" as const, parentId: "/sub" },
		];
		browsergentStore.getState().setFileNodes(nodes);
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual(["/sub"]);
		expect(state.nodes["/sub"]).toEqual(nodes[0]);
		expect(state.nodes["/sub/a.txt"]).toEqual(nodes[1]);
	});

	test("expandedFolderIds starts empty", () => {
		expect(browsergentStore.getState().files.expandedFolderIds).toEqual([]);
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
		browsergentStore.getState().setFileNodes([
			{ id: "f1", name: "a.txt", path: "/a.txt", kind: "file", size: 1 },
		]);
		browsergentStore.getState().toggleFolderExpanded("/sub");
		const state = browsergentStore.getState().files;
		expect(state.nodes["f1"]).toBeDefined();
		expect(state.rootIds).toEqual(["f1"]);
		expect(state.expandedFolderIds).toEqual(["/sub"]);
	});
});
