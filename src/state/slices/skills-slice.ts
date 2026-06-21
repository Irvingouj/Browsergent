import type { StoreApi } from "zustand/vanilla";
import type { SkillDiagnostic, SkillMeta } from "../../skills/skill-types";
import type { BrowsergentStore } from "../store";

export interface SkillsState {
	diagnostics: SkillDiagnostic[];
	catalog: SkillMeta[];
}

export interface SkillsSlice {
	skills: SkillsState;
	skillsDiagnosticsChanged(diagnostics: SkillDiagnostic[]): void;
	skillsCatalogChanged(catalog: SkillMeta[]): void;
}

export function createSkillsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): SkillsSlice {
	return {
		skills: { diagnostics: [], catalog: [] },
		skillsDiagnosticsChanged(diagnostics) {
			set((state) => ({ skills: { ...state.skills, diagnostics } }));
		},
		skillsCatalogChanged(catalog) {
			set((state) => ({ skills: { ...state.skills, catalog } }));
		},
	};
}
