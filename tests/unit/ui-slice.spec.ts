import { describe, expect, test } from "vitest";
import { createUiSlice } from "../../src/state/slices/ui-slice";

describe("createUiSlice", () => {
	type UiResult = {
		ui: { settingsOpen: boolean; taskDraft: string; activeTab: string };
	};
	function makeSet() {
		const calls: UiResult[] = [];
		const set = (fn: (state: unknown) => unknown) => {
			const state = {
				ui: {
					settingsOpen: false,
					taskDraft: "",
					activeTab: "chat",
				},
			};
			const result = fn(state) as UiResult;
			calls.push(result);
			return result;
		};
		return { set, calls };
	}

	test("setSettingsOpen toggles settingsOpen", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(
			set as unknown as Parameters<typeof createUiSlice>[0],
		);
		slice.setSettingsOpen(true);
		expect(calls[0].ui.settingsOpen).toBe(true);
	});

	test("setTaskDraft updates taskDraft", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(
			set as unknown as Parameters<typeof createUiSlice>[0],
		);
		slice.setTaskDraft("fill form");
		expect(calls[0].ui.taskDraft).toBe("fill form");
	});

	test("setActiveTab switches tab", () => {
		const { set, calls } = makeSet();
		const slice = createUiSlice(
			set as unknown as Parameters<typeof createUiSlice>[0],
		);
		slice.setActiveTab("files");
		expect(calls[0].ui.activeTab).toBe("files");
	});
});
