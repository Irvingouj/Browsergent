import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { BrowsergentStore } from "../store";

export interface SettingsState {
	anthropicApiKey: string;
	baseUrl: string;
	model: string;
	loaded: boolean;
	error?: BrowsergentError;
}

export interface SettingsSlice {
	settings: SettingsState;
	settingsLoaded(next: SettingsState): void;
	settingsDraftChanged(patch: Partial<SettingsState>): void;
	settingsSaveStarted(): void;
	settingsSaved(next: SettingsState): void;
	settingsSaveFailed(error: BrowsergentError): void;
}

export function createSettingsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): SettingsSlice {
	return {
		settings: {
			anthropicApiKey: "",
			baseUrl: "https://api.anthropic.com",
			model: "claude-sonnet-4-20250514",
			loaded: false,
		},
		settingsLoaded(next) {
			set({ settings: next });
		},
		settingsDraftChanged(patch) {
			set((state) => ({ settings: { ...state.settings, ...patch } }));
		},
		settingsSaveStarted() {
			set((state) => ({ settings: { ...state.settings, loaded: false } }));
		},
		settingsSaved(next) {
			set({ settings: next });
		},
		settingsSaveFailed(error) {
			set((state) => ({
				settings: { ...state.settings, error, loaded: true },
			}));
		},
	};
}
