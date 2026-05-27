import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { BrowsergentStore } from "../store";

export type LuaStatus =
	| "uninitialized"
	| "initializing"
	| "ready"
	| "running"
	| "restarting"
	| "error"
	| "disposed";

export interface LuaState {
	status: LuaStatus;
	output: string;
	lastError?: BrowsergentError;
}

export interface LuaActions {
	luaInitializing(): void;
	luaReady(): void;
	luaRunning(): void;
	luaOutputAppended(text: string): void;
	luaFailed(error: BrowsergentError): void;
	luaRestarting(reason: string): void;
	luaDisposed(): void;
	luaOutputCleared(): void;
}

export interface LuaSlice {
	lua: LuaState;
	luaInitializing(): void;
	luaReady(): void;
	luaRunning(): void;
	luaOutputAppended(text: string): void;
	luaFailed(error: BrowsergentError): void;
	luaRestarting(reason: string): void;
	luaDisposed(): void;
	luaOutputCleared(): void;
}

export function createLuaSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): LuaSlice {
	return {
		lua: { status: "uninitialized", output: "" },
		luaInitializing() {
			set((state) => ({ lua: { ...state.lua, status: "initializing" } }));
		},
		luaReady() {
			set((state) => ({
				lua: { ...state.lua, status: "ready", lastError: undefined },
			}));
		},
		luaRunning() {
			set((state) => ({ lua: { ...state.lua, status: "running" } }));
		},
		luaOutputAppended(text) {
			set((state) => ({
				lua: { ...state.lua, output: state.lua.output + text },
			}));
		},
		luaFailed(error) {
			set((state) => ({
				lua: { ...state.lua, status: "error", lastError: error },
			}));
		},
		luaRestarting(_reason) {
			set((state) => ({ lua: { ...state.lua, status: "restarting" } }));
		},
		luaDisposed() {
			set({ lua: { status: "disposed", output: "" } });
		},
		luaOutputCleared() {
			set((state) => ({ lua: { ...state.lua, output: "" } }));
		},
	};
}
