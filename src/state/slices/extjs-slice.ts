import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { BrowsergentStore } from "../store";

export type ExtjsStatus =
	| "uninitialized"
	| "initializing"
	| "ready"
	| "running"
	| "restarting"
	| "error"
	| "disposed";

export interface ExtjsState {
	status: ExtjsStatus;
	output: string;
	lastError?: BrowsergentError;
}

export interface ExtjsSlice {
	extjs: ExtjsState;
	extjsInitializing(): void;
	extjsReady(): void;
	extjsRunning(): void;
	extjsOutputAppended(text: string): void;
	extjsFailed(error: BrowsergentError): void;
	extjsRestarting(reason: string): void;
	extjsDisposed(): void;
}

export function createExtjsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): ExtjsSlice {
	return {
		extjs: { status: "uninitialized", output: "" },
		extjsInitializing() {
			set((state) => ({ extjs: { ...state.extjs, status: "initializing" } }));
		},
		extjsReady() {
			set((state) => ({
				extjs: { ...state.extjs, status: "ready", lastError: undefined },
			}));
		},
		extjsRunning() {
			set((state) => ({ extjs: { ...state.extjs, status: "running" } }));
		},
		extjsOutputAppended(text) {
			set((state) => ({
				extjs: { ...state.extjs, output: state.extjs.output + text },
			}));
		},
		extjsFailed(error) {
			set((state) => ({
				extjs: { ...state.extjs, status: "error", lastError: error },
			}));
		},
		extjsRestarting(_reason) {
			set((state) => ({ extjs: { ...state.extjs, status: "restarting" } }));
		},
		extjsDisposed() {
			set({ extjs: { status: "disposed", output: "" } });
		},
	};
}
