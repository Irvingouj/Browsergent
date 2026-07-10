import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FilesController } from "../../src/controllers/files";
import { refreshShallowFileTree } from "../../src/sidepanel/components/files/refresh-file-tree";
import type { FileNode } from "../../src/state/slices/files-slice";
import { browsergentStore } from "../../src/state/store";

function makeCtrl(
	lists: Record<string, FileNode[]>,
): FilesController {
	return {
		listDirectChildren: vi.fn(async (dirPath: string) => {
			return lists[dirPath] ?? [];
		}),
	} as unknown as FilesController;
}

describe("refreshShallowFileTree", () => {
	beforeEach(() => {
		browsergentStore.getState().clearFiles();
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
			"/": [
				{ id: "/notes", name: "notes", path: "/notes", kind: "directory" },
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
		expect(state.nodes["/notes/a.md"]?.name).toBe("a.md");
		expect(ctrl.listDirectChildren).toHaveBeenCalledWith("/");
		expect(ctrl.listDirectChildren).toHaveBeenCalledWith("/notes");
		expect(state.loadedDirPaths).toContain("/notes");
	});
});
