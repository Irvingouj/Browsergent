/**
 * Production open path for panel durable storage.
 *
 * Always uses IndexedDBStorage (serial-queued). Never returns MemoryStorage.
 * Callers map thrown errors to E_BOOT_IDB.
 */

import { IndexedDBStorage } from "./indexeddb-storage";
import { migrateFromChromeStorage } from "./migrate";
import type { StorageBackend } from "./storage-backend";

/**
 * Open the panel's durable storage backend.
 * @throws when IndexedDB open or migration fails
 */
export async function openPanelStorage(): Promise<StorageBackend> {
	const storage = new IndexedDBStorage();
	await storage.init();
	await migrateFromChromeStorage(storage);
	return storage;
}
