import type { StorageBackend } from "./storage-backend";

/**
 * Migrate old chrome.storage.local session/history values. Provider settings
 * are not migrated; the provider schema is pre-release and intentionally reset.
 */
export async function migrateFromChromeStorage(
	backend: StorageBackend,
): Promise<void> {
	const t0 = performance.now();
	console.info("[idb-timing] migrate_start");
	const migrated = await backend.get<boolean>("settings", "__migrated");
	if (migrated) {
		console.info(
			`[idb-timing] migrate_skip_already_done ${JSON.stringify({
				ms: Math.round(performance.now() - t0),
			})}`,
		);
		return;
	}

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
		console.info(
			`[idb-timing] migrate_did_work ${JSON.stringify({
				ms: Math.round(performance.now() - t0),
				hadSession: !!result.browsergentSession,
			})}`,
		);
	} catch {
		// chrome.storage.local unavailable (e.g. test env) — mark migrated to
		// avoid retrying. Real extension environments always have it.
		await backend.set("settings", "__migrated", true);
		console.info(
			`[idb-timing] migrate_mark_only ${JSON.stringify({
				ms: Math.round(performance.now() - t0),
			})}`,
		);
	}
}
