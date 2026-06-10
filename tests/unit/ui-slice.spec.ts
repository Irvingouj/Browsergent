import { describe, expect, test } from "vitest";
import { createUiSlice } from "../../src/state/slices/ui-slice";

describe("createUiSlice", () => {
	function makeSet() {
		const calls: unknown[] = [];
		const set = (fn: (state: unknown) => unknown) => {
			const state = {
				ui: {
					settingsOpen: false,
					taskDraft: "",
					activeTab: "chat",
				},
			};
			const result = fn(state);
			calls.push(result);
			return result;
		};
		return { set, calls };
	}

	test("setSettingsOpen toggles settingsOpen", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(set as any);
		slice.setSettingsOpen(true);
		expect((calls[0] as any).ui.settingsOpen).toBe(true);
	});

	test("setTaskDraft updates taskDraft", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(set as any);
		slice.setTaskDraft("fill form");
		expect((calls[0] as any).ui.taskDraft).toBe("fill form");
	});

	test("setActiveTab switches tab", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(set as any);
		slice.setActiveTab("files");
		expect((calls[0] as any).ui.activeTab).toBe("files");
	});
});
