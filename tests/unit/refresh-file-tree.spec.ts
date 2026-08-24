import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FilesController } from "../../src/controllers/files";
import {
	_resetFileTreeRefreshForTests,
	bindFileTreeController,
	refreshShallowFileTree,
	scheduleFileTreeRefresh,
} from "../../src/sidepanel/components/files/refresh-file-tree";
import type { FileNode } from "../../src/state/slices/files-slice";
import { browsergentStore } from "../../src/state/store";

function makeCtrl(lists: Record<string, FileNode[]>): FilesController {
	return {
		listDirectChildren: vi.fn(async (dirPath: string) => {
			return lists[dirPath] ?? [];
		}),
	} as unknown as FilesController;
}

describe("refreshShallowFileTree", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		_resetFileTreeRefreshForTests();
		browsergentStore.getState().clearFiles();
	});

	afterEach(() => {
		_resetFileTreeRefreshForTests();
		vi.useRealTimers();
	});

	test("loads only root children when nothing is expanded", async () => {
		const ctrl = makeCtrl({
			"/": [
				{ id: "/notes", name: "notes", path: "/notes", kind: "directory" },
				{
					id: "/readme.txt",
					name: "readme.txt",
					path: "/readme.txt",
					kind: "file",
				},
			],
			"/notes": [
				{
					id: "/notes/a.md",
					name: "a.md",
					path: "/notes/a.md",
					kind: "file",
					parentId: "/notes",
				},
			],
		});

		await refreshShallowFileTree(ctrl);

		const state = browsergentStore.getState().files;
		expect(state.rootIds.sort()).toEqual(["/notes", "/readme.txt"]);
		expect(state.nodes["/notes/a.md"]).toBeUndefined();
		expect(ctrl.listDirectChildren).toHaveBeenCalledTimes(1);
		expect(ctrl.listDirectChildren).toHaveBeenCalledWith("/");
		expect(state.loadedDirPaths).toEqual(["/"]);
	});

	test("also reloads expanded directories shallowly", async () => {
		browsergentStore.getState().toggleFolderExpanded("/notes");
		const ctrl = makeCtrl({
			"/": [{ id: "/notes", name: "notes", path: "/notes", kind: "directory" }],
			"/notes": [
				{
					id: "/notes/a.md",
					name: "a.md",
					path: "/notes/a.md",
					kind: "file",
					parentId: "/notes",
				},
			],
		});

		await refreshShallowFileTree(ctrl);

		const state = browsergentStore.getState().files;
		expect(state.nodes["/notes/a.md"]?.name).toBe("a.md");
		expect(ctrl.listDirectChildren).toHaveBeenCalledWith("/");
		expect(ctrl.listDirectChildren).toHaveBeenCalledWith("/notes");
		expect(state.loadedDirPaths).toContain("/notes");
	});

	test("refresh drops ghost nodes that no longer exist on disk", async () => {
		browsergentStore.getState().setDirectoryChildren(null, [
			{
				id: "/gone.txt",
				name: "gone.txt",
				path: "/gone.txt",
				kind: "file",
			},
			{
				id: "/kept.txt",
				name: "kept.txt",
				path: "/kept.txt",
				kind: "file",
			},
		]);
		expect(browsergentStore.getState().files.nodes["/gone.txt"]).toBeDefined();

		const ctrl = makeCtrl({
			"/": [
				{
					id: "/kept.txt",
					name: "kept.txt",
					path: "/kept.txt",
					kind: "file",
				},
			],
		});

		await refreshShallowFileTree(ctrl);

		const state = browsergentStore.getState().files;
		expect(state.nodes["/gone.txt"]).toBeUndefined();
		expect(state.nodes["/kept.txt"]?.name).toBe("kept.txt");
		expect(state.rootIds).toEqual(["/kept.txt"]);
	});

	test("scheduleFileTreeRefresh re-lists after debounce when controller is bound", async () => {
		const ctrl = makeCtrl({
			"/": [
				{
					id: "/after.txt",
					name: "after.txt",
					path: "/after.txt",
					kind: "file",
				},
			],
		});
		bindFileTreeController(ctrl);

		// Seed a ghost entry the refresh should remove.
		browsergentStore.getState().setDirectoryChildren(null, [
			{
				id: "/stale.txt",
				name: "stale.txt",
				path: "/stale.txt",
				kind: "file",
			},
		]);

		const versionBefore = browsergentStore.getState().files.filesVersion;
		scheduleFileTreeRefresh();
		expect(browsergentStore.getState().files.filesVersion).toBe(
			versionBefore + 1,
		);
		expect(ctrl.listDirectChildren).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(150);
		// Let the async refresh settle.
		await Promise.resolve();
		await Promise.resolve();

		const state = browsergentStore.getState().files;
		expect(ctrl.listDirectChildren).toHaveBeenCalledWith("/");
		expect(state.nodes["/stale.txt"]).toBeUndefined();
		expect(state.nodes["/after.txt"]?.name).toBe("after.txt");
	});
});
