import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { ProviderKind } from "../../types/messages";
import type { BrowsergentStore } from "../store";

export interface ProviderConfig {
	id: string;
	name: string;
	kind: ProviderKind;
	baseUrl: string;
	apiKey: string;
	model: string;
}

export interface SettingsState {
	providers: ProviderConfig[];
	activeProviderId: string | null;
	loaded: boolean;
	error?: BrowsergentError;
}

export interface SettingsSlice {
	settings: SettingsState;
	settingsLoaded(next: SettingsState): void;
	/** Patch the in-memory providers list (UI edits); persistence is the controller's job. */
	providersChanged(providers: ProviderConfig[]): void;
	activeProviderChanged(id: string | null): void;
	settingsSaveStarted(): void;
	settingsSaved(next: SettingsState): void;
	settingsSaveFailed(error: BrowsergentError): void;
	settingsErrorDismissed(): void;
}

export function createSettingsSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): SettingsSlice {
	return {
		settings: {
			providers: [],
			activeProviderId: null,
			loaded: false,
		},
		settingsLoaded(next) {
			set({ settings: next });
		},
		providersChanged(providers) {
			set((state) => ({
				settings: { ...state.settings, providers, error: undefined },
			}));
		},
		activeProviderChanged(id) {
			set((state) => ({
				settings: { ...state.settings, activeProviderId: id },
			}));
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
		settingsErrorDismissed() {
			set((state) => ({ settings: { ...state.settings, error: undefined } }));
		},
	};
}
