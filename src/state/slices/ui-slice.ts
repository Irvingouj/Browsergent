import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export type UiTab = "chat" | "files";

export type ChatUploadStatus =
	| { kind: "idle" }
	| { kind: "uploading" }
	| { kind: "error"; message: string };

export interface AtPickerState {
	query: string;
	startIndex: number;
	endIndex: number;
}

export interface SlashPickerState {
	query: string;
	startIndex: number;
}

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
	activeTab: UiTab;
	chatUpload: ChatUploadStatus;
	chatDragOver: boolean;
	atPicker: AtPickerState | null;
	slashPicker: SlashPickerState | null;
	pickerActiveIndex: number;
	openTabs: chrome.tabs.Tab[];
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
	setActiveTab(tab: UiTab): void;
	setChatUploadStatus(status: ChatUploadStatus): void;
	setChatDragOver(dragOver: boolean): void;
	setAtPicker(state: AtPickerState | null): void;
	setSlashPicker(state: SlashPickerState | null): void;
	setPickerActiveIndex(index: number): void;
	setOpenTabs(tabs: chrome.tabs.Tab[]): void;
	closePicker(): void;
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
			atPicker: null,
			slashPicker: null,
			pickerActiveIndex: 0,
			openTabs: [],
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
		setAtPicker(atPicker) {
			set((state) => ({ ui: { ...state.ui, atPicker, pickerActiveIndex: 0 } }));
		},
		setSlashPicker(slashPicker) {
			set((state) => ({
				ui: { ...state.ui, slashPicker, pickerActiveIndex: 0 },
			}));
		},
		setPickerActiveIndex(index) {
			set((state) => ({ ui: { ...state.ui, pickerActiveIndex: index } }));
		},
		setOpenTabs(tabs) {
			set((state) => ({ ui: { ...state.ui, openTabs: tabs } }));
		},
		closePicker() {
			set((state) => ({
				ui: { ...state.ui, atPicker: null, slashPicker: null, pickerActiveIndex: 0 },
			}));
		},
	};
}
