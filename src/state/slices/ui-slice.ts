import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export type UiTab = "chat" | "files";

export type ChatUploadStatus =
	| { kind: "idle" }
	| { kind: "uploading" }
	| { kind: "error"; message: string };

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
	activeTab: UiTab;
	chatUpload: ChatUploadStatus;
	chatDragOver: boolean;
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
	setActiveTab(tab: UiTab): void;
	setChatUploadStatus(status: ChatUploadStatus): void;
	setChatDragOver(dragOver: boolean): void;
}

export function createUiSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): UiSlice {
	return {
		ui: {
			settingsOpen: false,
			taskDraft: "",
			activeTab: "chat",
			chatUpload: { kind: "idle" },
			chatDragOver: false,
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
		setChatUploadStatus(status) {
			set((state) => ({ ui: { ...state.ui, chatUpload: status } }));
		},
		setChatDragOver(dragOver) {
			set((state) => ({ ui: { ...state.ui, chatDragOver: dragOver } }));
		},
	};
}
