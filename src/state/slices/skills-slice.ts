import type { StoreApi } from "zustand/vanilla";
import type { SkillDiagnostic } from "../../skills/skill-types";
import type { BrowsergentStore } from "../store";

export interface SkillsState {
	diagnostics: SkillDiagnostic[];
}

export interface SkillsSlice {
	skills: SkillsState;
	skillsDiagnosticsChanged(diagnostics: SkillDiagnostic[]): void;
}

export function createSkillsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): SkillsSlice {
	return {
		skills: { diagnostics: [] },
		skillsDiagnosticsChanged(diagnostics) {
			set({ skills: { diagnostics } });
		},
	};
}
