import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { AgentTraceEntry } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export interface TraceState {
	entries: AgentTraceEntry[];
}

export interface TraceActions {
	traceStarted(entry: AgentTraceEntry): void;
	traceUpdated(entry: AgentTraceEntry): void;
	traceFinished(id: string, result: string): void;
	traceFailed(id: string, error: BrowsergentError): void;
	clearTrace(): void;
	hydrateTrace(entries: AgentTraceEntry[]): void;
}

export interface TraceSlice {
	trace: TraceState;
	traceStarted(entry: AgentTraceEntry): void;
	traceUpdated(entry: AgentTraceEntry): void;
	traceFinished(id: string, result: string): void;
	traceFailed(id: string, error: BrowsergentError): void;
	clearTrace(): void;
	hydrateTrace(entries: AgentTraceEntry[]): void;
}

export function createTraceSlice(
	set: StoreApi<BrowsergentStore>["setState"],
	_get: StoreApi<BrowsergentStore>["getState"],
): TraceSlice {
	return {
		trace: { entries: [] },
		traceStarted(entry) {
			set((state) => {
				if (state.trace.entries.some((e) => e.id === entry.id)) {
					return state;
				}
				return { trace: { entries: [...state.trace.entries, entry] } };
			});
		},
		traceUpdated(entry) {
			set((state) => {
				const idx = state.trace.entries.findIndex((e) => e.id === entry.id);
				if (idx >= 0) {
					const next = [...state.trace.entries];
					next[idx] = { ...next[idx], ...entry };
					return { trace: { entries: next } };
				}
				return { trace: { entries: [...state.trace.entries, entry] } };
			});
		},
		traceFinished(id, result) {
			set((state) => {
				const idx = state.trace.entries.findIndex((e) => e.id === id);
				if (idx >= 0) {
					const next = [...state.trace.entries];
					const existing = next[idx];
					if (existing) {
						next[idx] = { ...existing, status: "done", result };
					}
					return { trace: { entries: next } };
				}
				return state;
			});
		},
		traceFailed(id, _error) {
			set((state) => {
				const idx = state.trace.entries.findIndex((e) => e.id === id);
				if (idx >= 0) {
					const next = [...state.trace.entries];
					const existing = next[idx];
					if (existing) {
						next[idx] = { ...existing, status: "error" };
					}
					return { trace: { entries: next } };
				}
				return state;
			});
		},
		clearTrace() {
			set({ trace: { entries: [] } });
		},
		hydrateTrace(entries) {
			set({ trace: { entries } });
		},
	};
}
