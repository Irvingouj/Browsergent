import type { StorageBackend } from "./storage-backend";

export class MemoryStorage implements StorageBackend {
	private stores = new Map<string, Map<string, unknown>>();

	async get<T>(store: string, key: string): Promise<T | null> {
		const s = this.stores.get(store);
		return (s?.get(key) as T) ?? null;
	}

	async set<T>(store: string, key: string, value: T): Promise<void> {
		let s = this.stores.get(store);
		if (!s) {
			s = new Map();
			this.stores.set(store, s);
		}
		s.set(key, value);
	}

	async remove(store: string, key: string): Promise<void> {
		this.stores.get(store)?.delete(key);
	}

	async getAll<T>(store: string): Promise<T[]> {
		return Array.from(this.stores.get(store)?.values() ?? []) as T[];
	}

	async getAllKeys(store: string): Promise<string[]> {
		return Array.from(this.stores.get(store)?.keys() ?? []);
	}

	async clear(): Promise<void> {
		this.stores.clear();
	}

	async close(): Promise<void> {
		this.stores.clear();
	}
}
