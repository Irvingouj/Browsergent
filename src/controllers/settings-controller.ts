import type { ProviderConfig } from "../state/slices/settings-slice";
import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";

export interface SettingsValues {
	providers: ProviderConfig[];
	activeProviderId: string | null;
}

export class SettingsController {
	constructor(private readonly storage: StorageBackend) {}

	async load(): Promise<void> {
		const providers =
			(await this.storage.get<ProviderConfig[]>("settings", "providers")) ?? [];
		const activeProviderId =
			(await this.storage.get<string | null>("settings", "activeProviderId")) ??
			null;
		browsergentStore.getState().settingsLoaded({
			providers,
			activeProviderId,
			loaded: true,
		});
	}

	async save(values: SettingsValues): Promise<void> {
		try {
			await this.storage.set("settings", "providers", values.providers);
			await this.storage.set(
				"settings",
				"activeProviderId",
				values.activeProviderId,
			);
			browsergentStore.getState().settingsSaved({
				providers: values.providers,
				activeProviderId: values.activeProviderId,
				loaded: true,
			});
		} catch (err) {
			browsergentStore.getState().settingsSaveFailed({
				code: "E_SETTINGS_PERSIST",
				message: err instanceof Error ? err.message : String(err),
				source: "settings",
				details: { operation: "save" },
			});
		}
	}
}
