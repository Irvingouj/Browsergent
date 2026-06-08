import { createStore } from "zustand/vanilla";
import { type AgentSlice, createAgentSlice } from "./slices/agent-slice";
import { type ChatSlice, createChatSlice } from "./slices/chat-slice";
import {
	createDiagnosticsSlice,
	type DiagnosticsSlice,
} from "./slices/diagnostics-slice";
import { createExtjsSlice, type ExtjsSlice } from "./slices/extjs-slice";
import { createSessionSlice, type SessionSlice } from "./slices/session-slice";
import {
	createSettingsSlice,
	type SettingsSlice,
} from "./slices/settings-slice";
import { createTraceSlice, type TraceSlice } from "./slices/trace-slice";
import { createUiSlice, type UiSlice } from "./slices/ui-slice";

export interface BrowsergentStore
	extends SettingsSlice,
		ChatSlice,
		AgentSlice,
		TraceSlice,
		DiagnosticsSlice,
		ExtjsSlice,
		UiSlice,
		SessionSlice {}

export const browsergentStore = createStore<BrowsergentStore>((set) => ({
	...createSettingsSlice(set),
	...createChatSlice(set),
	...createAgentSlice(set),
	...createTraceSlice(set),
	...createDiagnosticsSlice(set),
	...createExtjsSlice(set),
	...createUiSlice(set),
	...createSessionSlice(set),
}));
