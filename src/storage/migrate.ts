import type { ProviderConfig } from "../state/slices/settings-slice";
import {
	defaultBaseUrlFor,
	defaultModelFor,
} from "../worker/provider-defaults";
import type { StorageBackend } from "./storage-backend";

/**
 * Migrate legacy single-provider settings (apiKey/baseUrl/model) and
 * chrome.storage.local values into the providers-list model.
 *
 * Runs once (guarded by the __migrated flag). If old single-provider values
 * exist, they become one anthropic ProviderConfig set as active. If
 * chrome.storage.local is unavailable (test env), we still mark migrated.
 */
export async function migrateFromChromeStorage(
	backend: StorageBackend,
): Promise<void> {
	const migrated = await backend.get<boolean>("settings", "__migrated");
	if (migrated) return;

	try {
		const result = await chrome.storage.local.get(null);

		if (result.browsergentSession) {
			await backend.set("sessions", "current", result.browsergentSession);
		}

		if (result.browsergentConversationHistory) {
			await backend.set("history", "current", {
				id: "current",
				timestamp: Date.now(),
				messages: result.browsergentConversationHistory,
			});
		}
		// Legacy single-provider migration → one anthropic ProviderConfig.
		const apiKey =
			typeof result.anthropicApiKey === "string"
				? result.anthropicApiKey
				: undefined;
		const baseUrl =
			typeof result.anthropicBaseUrl === "string"
				? result.anthropicBaseUrl
				: defaultBaseUrlFor("anthropic");
		const model =
			typeof result.anthropicModel === "string"
				? result.anthropicModel
				: defaultModelFor("anthropic");
		if (apiKey) {
			const config: ProviderConfig = {
				id: "migrated-anthropic",
				name: "Anthropic",
				kind: "anthropic",
				baseUrl,
				apiKey,
				model,
			};
			await backend.set("settings", "providers", [config]);
			await backend.set("settings", "activeProviderId", config.id);
		}

		await backend.set("settings", "__migrated", true);
	} catch {
		// chrome.storage.local unavailable (e.g. test env) — mark migrated to
		// avoid retrying. Real extension environments always have it.
		await backend.set("settings", "__migrated", true);
	}
}

/**
 * Fold legacy single-value settings (pre-provider-list) into the providers
 * list on first load. Idempotent: no-op once a providers array exists.
 */
export async function migrateLegacySingleProvider(
	backend: StorageBackend,
): Promise<void> {
	const existing =
		(await backend.get<ProviderConfig[]>("settings", "providers")) ?? [];
	if (existing.length > 0) return;

	const apiKey = await backend.get<string>("settings", "apiKey");
	const baseUrl =
		(await backend.get<string>("settings", "baseUrl")) ??
		defaultBaseUrlFor("anthropic");
	const model =
		(await backend.get<string>("settings", "model")) ??
		defaultModelFor("anthropic");
	if (!apiKey) return;

	const config: ProviderConfig = {
		id: "migrated-anthropic",
		name: "Anthropic",
		kind: "anthropic",
		baseUrl,
		apiKey,
		model,
	};
	await backend.set("settings", "providers", [config]);
	await backend.set("settings", "activeProviderId", config.id);
}
