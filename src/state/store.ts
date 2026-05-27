import { useStore } from "zustand/react";
import { createStore } from "zustand/vanilla";
import { type AgentSlice, createAgentSlice } from "./slices/agent-slice";
import { type ChatSlice, createChatSlice } from "./slices/chat-slice";
import { createLuaSlice, type LuaSlice } from "./slices/lua-slice";
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
		LuaSlice,
		UiSlice {}

export const browsergentStore = createStore<BrowsergentStore>((set, get) => ({
	...createSettingsSlice(set, get),
	...createChatSlice(set, get),
	...createAgentSlice(set, get),
	...createTraceSlice(set, get),
	...createLuaSlice(set, get),
	...createUiSlice(set, get),
}));

export { useStore };
