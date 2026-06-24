import type { BrowsergentStore } from "./store";

export const selectMessageIds = (s: BrowsergentStore) => s.chat.messageIds;
export const selectMessagesById = (s: BrowsergentStore) => s.chat.messagesById;
export const selectTraceEntries = (s: BrowsergentStore) => s.trace.entries;
export const selectDiagnosticEvents = (s: BrowsergentStore) =>
	s.diagnostics.events;

export interface RetryState {
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	status?: number;
	errorLabel: string;
}

const STATUS_LABELS: Record<number, string> = {
	429: "rate limit",
	500: "server error",
	502: "bad gateway",
	503: "unavailable",
	504: "timeout",
	529: "overloaded",
};

function retryErrorLabel(status: number | undefined): string {
	if (status !== undefined && status in STATUS_LABELS) {
		return STATUS_LABELS[status] ?? `http ${status}`;
	}
	if (status !== undefined) {
		return `http ${status}`;
	}
	return "network error";
}

const ACTIVE_RUN_STATUSES: Record<string, true> = {
	loading: true,
	running: true,
	waiting_for_model: true,
	executing_tool: true,
};

export const selectRetryState = (s: BrowsergentStore): RetryState | null => {
	if (!(s.agent.status in ACTIVE_RUN_STATUSES)) return null;
	const events = s.diagnostics.events;
	if (events.length === 0) return null;
	const last = events[events.length - 1];
	if (last === undefined || last.kind !== "provider_retry") return null;
	return {
		attempt: last.attempt,
		maxAttempts: last.maxAttempts,
		delayMs: last.delayMs,
		status: last.status,
		errorLabel: retryErrorLabel(last.status),
	};
};
export const selectAgentStatus = (s: BrowsergentStore) => s.agent.status;
export const selectAgentStatusReason = (s: BrowsergentStore) =>
	s.agent.statusReason;
export const selectAgentActiveRunId = (s: BrowsergentStore) =>
	s.agent.activeRunId;
export const selectTaskDraft = (s: BrowsergentStore) => s.ui.taskDraft;
export const selectActiveTab = (s: BrowsergentStore) => s.ui.activeTab;
export const selectChatUpload = (s: BrowsergentStore) => s.ui.chatUpload;
export const selectChatDragOver = (s: BrowsergentStore) => s.ui.chatDragOver;
export const selectApiKey = (s: BrowsergentStore) => s.settings.anthropicApiKey;
export const selectBaseUrl = (s: BrowsergentStore) => s.settings.baseUrl;
export const selectModel = (s: BrowsergentStore) => s.settings.model;
export const selectSettingsOpen = (s: BrowsergentStore) => s.ui.settingsOpen;
export const selectSessionPanelOpen = (s: BrowsergentStore) =>
	s.session.sessionPanelOpen;
export const selectSessions = (s: BrowsergentStore) => s.session.sessions;
export const selectActiveSessionId = (s: BrowsergentStore) =>
	s.session.activeSessionId;
export const selectExtjsStatus = (s: BrowsergentStore) => s.extjs.status;
export const selectSkillDiagnostics = (s: BrowsergentStore) =>
	s.skills.diagnostics;
export const selectSkillCatalog = (s: BrowsergentStore) => s.skills.catalog;

export const selectFilesState = (s: BrowsergentStore) => s.files;
export const selectSelectedFileId = (s: BrowsergentStore) =>
	s.files.selectedFileId;
export const selectFilesVersion = (s: BrowsergentStore) => s.files.filesVersion;
export const selectExpandedFolderIds = (s: BrowsergentStore) =>
	s.files.expandedFolderIds;
export const selectCreatingKind = (s: BrowsergentStore) => s.files.creatingKind;
export const selectCreatingName = (s: BrowsergentStore) => s.files.creatingName;
export const selectCreatingParentPath = (s: BrowsergentStore) =>
	s.files.creatingParentPath;
export const selectContextMenu = (s: BrowsergentStore) => s.files.contextMenu;
export const selectMovePromptTarget = (s: BrowsergentStore) =>
	s.files.movePromptTarget;
export const selectMovePromptValue = (s: BrowsergentStore) =>
	s.files.movePromptValue;
export const selectRenamingNodeId = (s: BrowsergentStore) =>
	s.files.renamingNodeId;
export const selectOpenTabs = (s: BrowsergentStore) => s.ui.openTabs;
