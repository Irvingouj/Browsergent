import { beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("FilesSlice", () => {
	beforeEach(() => {
		browsergentStore.getState().clearFiles();
	});

	test("hydrateFiles replaces nodes and rootIds", () => {
		const nodes = [
			{ id: "f1", name: "a.txt", path: "/p/a.txt", kind: "file" as const, size: 1, mime: "text/plain" },
			{ id: "f2", name: "b.txt", path: "/p/b.txt", kind: "file" as const, size: 2, mime: "text/plain" },
		];
		browsergentStore.getState().hydrateFiles(nodes, "session-1");
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual(["f1", "f2"]);
		expect(state.nodes["f1"]).toEqual(nodes[0]);
		expect(state.nodes["f2"]).toEqual(nodes[1]);
		expect(state.selectedFileId).toBeNull();
		expect(state.filesSessionId).toBe("session-1");
	});

	test("hydrateFiles with empty array clears state", () => {
		browsergentStore.getState().addFileNode({ id: "f1", name: "a.txt", path: "/p/a.txt", kind: "file", size: 1, mime: "text/plain" });
		expect(browsergentStore.getState().files.rootIds.length).toBe(1);
		browsergentStore.getState().hydrateFiles([], "session-2");
		const state = browsergentStore.getState().files;
		expect(state.rootIds).toEqual([]);
		expect(Object.keys(state.nodes)).toEqual([]);
		expect(state.selectedFileId).toBeNull();
		expect(state.filesSessionId).toBe("session-2");
	});
});
