import type { StoreApi } from "zustand/vanilla";
import type { AgentTraceEntry } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export interface TraceState {
	entries: AgentTraceEntry[];
}

export interface TraceSlice {
	trace: TraceState;
	traceUpdated(entry: AgentTraceEntry): void;
	clearTrace(): void;
	hydrateTrace(entries: AgentTraceEntry[]): void;
}

export function createTraceSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): TraceSlice {
	return {
		trace: { entries: [] },
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
		clearTrace() {
			set({ trace: { entries: [] } });
		},
		hydrateTrace(entries) {
			set({ trace: { entries } });
		},
	};
}
