import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";
import type { ProviderConfig } from "../worker/provider-schema";
import { providerConfigSchema } from "../worker/provider-schema";

export interface SettingsValues {
	providers: ProviderConfig[];
	activeProviderId: string | null;
}

export class SettingsController {
	constructor(private readonly storage: StorageBackend) {}

	async load(): Promise<void> {
		try {
			const raw: unknown =
				(await this.storage.get("settings", "providers")) ?? [];
			const providers = (Array.isArray(raw) ? raw : [])
				.map((item) => providerConfigSchema.safeParse(item))
				.filter((r): r is { success: true; data: ProviderConfig } => r.success)
				.map((r) => r.data);
			const validIds = new Set(providers.map((p) => p.id));
			const storedActive =
				(await this.storage.get<string | null>(
					"settings",
					"activeProviderId",
				)) ?? null;
			const activeProviderId =
				storedActive && validIds.has(storedActive) ? storedActive : null;
			browsergentStore.getState().settingsLoaded({
				providers,
				activeProviderId,
				loaded: true,
			});
		} catch (err) {
			// Never leave the UI stuck on "Loading settings…".
			browsergentStore.getState().settingsLoaded({
				providers: browsergentStore.getState().settings.providers,
				activeProviderId: browsergentStore.getState().settings.activeProviderId,
				loaded: true,
				error: {
					code: "E_SETTINGS_PERSIST",
					message: err instanceof Error ? err.message : String(err),
					source: "settings",
					details: { operation: "load" },
				},
			});
			throw err;
		}
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
