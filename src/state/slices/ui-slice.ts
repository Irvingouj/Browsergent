import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export type UiTab = "chat" | "files";

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
	activeTab: UiTab;
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
	setActiveTab(tab: UiTab): void;
}

export function createUiSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): UiSlice {
	return {
		ui: {
			settingsOpen: false,
			taskDraft: "",
			activeTab: "chat",
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
	};
}
