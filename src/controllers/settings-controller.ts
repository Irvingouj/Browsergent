import { browsergentStore } from "../state/store";

export interface SettingsValues {
	anthropicApiKey: string;
	baseUrl: string;
	model: string;
}

export class SettingsController {
	async load(): Promise<void> {
		const result = await chrome.storage.local.get([
			"anthropicApiKey",
			"anthropicBaseUrl",
			"anthropicModel",
		]);
		const current = browsergentStore.getState().settings;
		browsergentStore.getState().settingsLoaded({
			anthropicApiKey:
				(result.anthropicApiKey as string | undefined) ??
				current.anthropicApiKey,
			baseUrl:
				(result.anthropicBaseUrl as string | undefined) ?? current.baseUrl,
			model: (result.anthropicModel as string | undefined) ?? current.model,
			loaded: true,
		});
	}

	async save(settings: SettingsValues): Promise<void> {
		try {
			browsergentStore.getState().settingsSaveStarted();
			await chrome.storage.local.set({
				anthropicApiKey: settings.anthropicApiKey,
				anthropicBaseUrl: settings.baseUrl,
				anthropicModel: settings.model,
			});
			browsergentStore.getState().settingsSaved({
				anthropicApiKey: settings.anthropicApiKey,
				baseUrl: settings.baseUrl,
				model: settings.model,
				loaded: true,
			});
		} catch (err) {
			browsergentStore.getState().settingsSaveFailed({
				code: "E_BAD_SETTINGS",
				message: err instanceof Error ? err.message : String(err),
				source: "settings",
			});
		}
	}
}
