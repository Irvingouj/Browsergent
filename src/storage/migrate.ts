import type { StorageBackend } from "./storage-backend";

/**
 * Migrate old chrome.storage.local session/history values. Provider settings
 * are not migrated; the provider schema is pre-release and intentionally reset.
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
		await backend.set("settings", "__migrated", true);
	} catch {
		// chrome.storage.local unavailable (e.g. test env) — mark migrated to
		// avoid retrying. Real extension environments always have it.
		await backend.set("settings", "__migrated", true);
	}
}
