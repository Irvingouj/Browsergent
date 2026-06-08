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
					jsCodeDraft: "",
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
		slice.setActiveTab("js");
		expect((calls[0] as any).ui.activeTab).toBe("js");
	});

	test("setJsCodeDraft updates jsCodeDraft", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(set as any);
		slice.setJsCodeDraft("page.snapshot()");
		expect((calls[0] as any).ui.jsCodeDraft).toBe("page.snapshot()");
	});
});
