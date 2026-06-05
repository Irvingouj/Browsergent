import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { BrowsergentStore } from "../store";

export type JsStatus =
	| "uninitialized"
	| "initializing"
	| "ready"
	| "running"
	| "restarting"
	| "error"
	| "disposed";

export interface JsState {
	status: JsStatus;
	output: string;
	lastError?: BrowsergentError;
}

export interface JsActions {
	jsInitializing(): void;
	jsReady(): void;
	jsRunning(): void;
	jsOutputAppended(text: string): void;
	jsFailed(error: BrowsergentError): void;
	jsRestarting(reason: string): void;
	jsDisposed(): void;
	jsOutputCleared(): void;
}

export interface JsSlice {
	js: JsState;
	jsInitializing(): void;
	jsReady(): void;
	jsRunning(): void;
	jsOutputAppended(text: string): void;
	jsFailed(error: BrowsergentError): void;
	jsRestarting(reason: string): void;
	jsDisposed(): void;
	jsOutputCleared(): void;
}

export function createJsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): JsSlice {
	return {
		js: { status: "uninitialized", output: "" },
		jsInitializing() {
			set((state) => ({ js: { ...state.js, status: "initializing" } }));
		},
		jsReady() {
			set((state) => ({
				js: { ...state.js, status: "ready", lastError: undefined },
			}));
		},
		jsRunning() {
			set((state) => ({ js: { ...state.js, status: "running" } }));
		},
		jsOutputAppended(text) {
			set((state) => ({
				js: { ...state.js, output: state.js.output + text },
			}));
		},
		jsFailed(error) {
			set((state) => ({
				js: { ...state.js, status: "error", lastError: error },
			}));
		},
		jsRestarting(_reason) {
			set((state) => ({ js: { ...state.js, status: "restarting" } }));
		},
		jsDisposed() {
			set({ js: { status: "disposed", output: "" } });
		},
		jsOutputCleared() {
			set((state) => ({ js: { ...state.js, output: "" } }));
		},
	};
}
