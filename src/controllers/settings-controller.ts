import type { ProviderConfig } from "../state/slices/settings-slice";
import { browsergentStore } from "../state/store";
import type { StorageBackend } from "../storage/storage-backend";

export interface SettingsValues {
	providers: ProviderConfig[];
	activeProviderId: string | null;
}

function nonNull<T>(value: T | null): value is T {
	return value !== null;
}

/**
 * Stale storage may hold the pre-refactor provider shape ({kind, baseUrl,
 * apiKey, model} with no models[]/defaultModelId/chatEndpointUrl). Normalize
 * so the rest of the app never sees a malformed ProviderConfig. Returns null
 * if the entry is too broken to recover.
 */
function normalizeProvider(raw: ProviderConfig): ProviderConfig | null {
	if (!raw || typeof raw !== "object" || !raw.id || !raw.kind) return null;
	const models = Array.isArray(raw.models)
		? raw.models.filter(
				(m): m is NonNullable<typeof m> =>
					m !== null && typeof m === "object" && !!m.id,
			)
		: [];
	return {
		...raw,
		chatEndpointUrl: raw.chatEndpointUrl ?? "",
		modelsEndpointUrl: raw.modelsEndpointUrl ?? "",
		defaultModelId: raw.defaultModelId ?? "",
		models,
	};
}

export class SettingsController {
	constructor(private readonly storage: StorageBackend) {}

	async load(): Promise<void> {
		const raw =
			(await this.storage.get<ProviderConfig[]>("settings", "providers")) ?? [];
		const providers = raw.map(normalizeProvider).filter(nonNull);
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
