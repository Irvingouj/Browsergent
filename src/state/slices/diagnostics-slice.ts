import type { StoreApi } from "zustand/vanilla";
import type { AgentDiagnosticEvent } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export interface DiagnosticsState {
	events: AgentDiagnosticEvent[];
}

export interface DiagnosticsSlice {
	diagnostics: DiagnosticsState;
	diagnosticAdded(event: AgentDiagnosticEvent): void;
	clearDiagnostics(): void;
	hydrateDiagnostics(events: AgentDiagnosticEvent[]): void;
}

export function createDiagnosticsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): DiagnosticsSlice {
	return {
		diagnostics: { events: [] },
		diagnosticAdded(event) {
			set((state) => ({
				diagnostics: { events: [...state.diagnostics.events, event] },
			}));
		},
		clearDiagnostics() {
			set({ diagnostics: { events: [] } });
		},
		hydrateDiagnostics(events) {
			set({ diagnostics: { events } });
		},
	};
}
