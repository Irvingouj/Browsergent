import type { BrowsergentStore } from "./store";

export const selectMessageIds = (s: BrowsergentStore) => s.chat.messageIds;
export const selectMessagesById = (s: BrowsergentStore) => s.chat.messagesById;
export const selectTraceEntries = (s: BrowsergentStore) => s.trace.entries;
export const selectDiagnosticEvents = (s: BrowsergentStore) =>
	s.diagnostics.events;
export const selectAgentStatus = (s: BrowsergentStore) => s.agent.status;
export const selectAgentStatusReason = (s: BrowsergentStore) =>
	s.agent.statusReason;
export const selectAgentActiveRunId = (s: BrowsergentStore) =>
	s.agent.activeRunId;
export const selectTaskDraft = (s: BrowsergentStore) => s.ui.taskDraft;
export const selectActiveTab = (s: BrowsergentStore) => s.ui.activeTab;
export const selectJsCodeDraft = (s: BrowsergentStore) => s.ui.jsCodeDraft;
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
