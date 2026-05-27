import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
}

export interface UiActions {
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
}

export function createUiSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): UiSlice {
	return {
		ui: { settingsOpen: false, taskDraft: "" },
		setSettingsOpen(open) {
			set((state) => ({ ui: { ...state.ui, settingsOpen: open } }));
		},
		setTaskDraft(text) {
			set((state) => ({ ui: { ...state.ui, taskDraft: text } }));
		},
	};
}
