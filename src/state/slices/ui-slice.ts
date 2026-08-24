import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentStore } from "../store";

export type UiTab = "chat" | "files" | "enroll" | "settings";

export type ChatUploadStatus =
	| { kind: "idle" }
	| { kind: "uploading" }
	| { kind: "error"; message: string };

export interface ChatContextMenuState {
	messageId: string;
	x: number;
	y: number;
}

export interface UiState {
	settingsOpen: boolean;
	taskDraft: string;
	activeTab: UiTab;
	chatUpload: ChatUploadStatus;
	chatDragOver: boolean;
	openTabs: chrome.tabs.Tab[];
	chatContextMenu: ChatContextMenuState | null;
}

export interface UiSlice {
	ui: UiState;
	setSettingsOpen(open: boolean): void;
	setTaskDraft(text: string): void;
	setActiveTab(tab: UiTab): void;
	setChatUploadStatus(status: ChatUploadStatus): void;
	setChatDragOver(dragOver: boolean): void;
	setOpenTabs(tabs: chrome.tabs.Tab[]): void;
	openChatContextMenu(messageId: string, x: number, y: number): void;
	closeChatContextMenu(): void;
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
			openTabs: [],
			chatContextMenu: null,
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
		setOpenTabs(tabs) {
			set((state) => ({ ui: { ...state.ui, openTabs: tabs } }));
		},
		openChatContextMenu(messageId, x, y) {
			set((state) => ({
				ui: { ...state.ui, chatContextMenu: { messageId, x, y } },
			}));
		},
		closeChatContextMenu() {
			set((state) => ({ ui: { ...state.ui, chatContextMenu: null } }));
		},
	};
}
