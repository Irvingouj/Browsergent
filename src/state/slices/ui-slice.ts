import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
}

export function createUiSlice(
	set: StoreApi<BrowsergentStore>["setState"],
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
