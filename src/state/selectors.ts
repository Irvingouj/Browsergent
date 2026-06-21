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
export const selectAtPicker = (s: BrowsergentStore) => s.ui.atPicker;
export const selectSlashPicker = (s: BrowsergentStore) => s.ui.slashPicker;
export const selectPickerActiveIndex = (s: BrowsergentStore) =>
	s.ui.pickerActiveIndex;
export const selectOpenTabs = (s: BrowsergentStore) => s.ui.openTabs;
