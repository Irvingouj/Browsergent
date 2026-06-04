import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";

export interface SettingsValues {
	anthropicApiKey: string;
	baseUrl: string;
	model: string;
}

export class SettingsController {
	constructor(private readonly storage: StorageBackend) {}

	async load(): Promise<void> {
		const apiKey = await this.storage.get<string>("settings", "apiKey");
		const baseUrl = await this.storage.get<string>("settings", "baseUrl");
		const model = await this.storage.get<string>("settings", "model");
		const current = browsergentStore.getState().settings;
		browsergentStore.getState().settingsLoaded({
			anthropicApiKey: apiKey ?? current.anthropicApiKey,
			baseUrl: baseUrl ?? current.baseUrl,
			model: model ?? current.model,
			loaded: true,
		});
	}

	async save(settings: SettingsValues): Promise<void> {
		try {
			browsergentStore.getState().settingsSaveStarted();
			await this.storage.set("settings", "apiKey", settings.anthropicApiKey);
			await this.storage.set("settings", "baseUrl", settings.baseUrl);
			await this.storage.set("settings", "model", settings.model);
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
