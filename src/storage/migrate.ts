import type { StorageBackend } from "./storage-backend";

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

		if (result.anthropicApiKey) {
			await backend.set("settings", "apiKey", result.anthropicApiKey);
		}
		if (result.anthropicBaseUrl) {
			await backend.set("settings", "baseUrl", result.anthropicBaseUrl);
		}
		if (result.anthropicModel) {
			await backend.set("settings", "model", result.anthropicModel);
		}

		await backend.set("settings", "__migrated", true);
	} catch (_err) {
		// If chrome.storage.local is unavailable (e.g. test environment), mark migrated
		// to avoid retrying. Real extension environments always have chrome.storage.local.
		await backend.set("settings", "__migrated", true);
	}
}
