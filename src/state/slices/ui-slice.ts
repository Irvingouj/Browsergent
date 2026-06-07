import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export type UiTab = "chat" | "js";

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
	activeTab: UiTab;
	jsCodeDraft: string;
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
	setActiveTab(tab: UiTab): void;
	setJsCodeDraft(text: string): void;
}

export function createUiSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): UiSlice {
	return {
		ui: {
			settingsOpen: false,
			taskDraft: "",
			activeTab: "chat",
			jsCodeDraft: "",
		},
		setSettingsOpen(open) {
			set((state) => ({ ui: { ...state.ui, settingsOpen: open } }));
		},
		setTaskDraft(text) {
			set((state) => ({ ui: { ...state.ui, taskDraft: text } }));
		},
		setActiveTab(tab) {
			set((state) => ({ ui: { ...state.ui, activeTab: tab } }));
		},
		setJsCodeDraft(text) {
			set((state) => ({ ui: { ...state.ui, jsCodeDraft: text } }));
		},
	};
}
