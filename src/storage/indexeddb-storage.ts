import type { StorageBackend } from "./storage-backend";

export class IndexedDBStorage implements StorageBackend {
	private db: IDBDatabase | null = null;
	private readonly dbName = "browsergent";
	private readonly version = 2;

	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				const oldVersion = event.oldVersion;

				// Drop stores from v1 that had keyPath and recreate without keyPath
				if (oldVersion < 2) {
					for (const name of Array.from(db.objectStoreNames)) {
						db.deleteObjectStore(name);
					}
				}

				if (!db.objectStoreNames.contains("settings")) {
					db.createObjectStore("settings");
				}
				if (!db.objectStoreNames.contains("sessions")) {
					const store = db.createObjectStore("sessions");
					store.createIndex("timestamp", "timestamp", { unique: false });
				}
				if (!db.objectStoreNames.contains("history")) {
					const store = db.createObjectStore("history");
					store.createIndex("timestamp", "timestamp", { unique: false });
				}
				if (!db.objectStoreNames.contains("runs")) {
					const store = db.createObjectStore("runs");
					store.createIndex("timestamp", "timestamp", { unique: false });
					store.createIndex("status", "status", { unique: false });
				}
			};

			request.onsuccess = (event) => {
				this.db = (event.target as IDBOpenDBRequest).result;
				resolve();
			};

			request.onerror = () => {
				reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
			};

			request.onblocked = () => {
				reject(new Error("IndexedDB upgrade blocked by another tab"));
			};
		});
	}

	async get<T>(store: string, key: string): Promise<T | null> {
		if (!this.db) throw new Error("IndexedDB not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(store, "readonly");
			const objectStore = tx.objectStore(store);
			const request = objectStore.get(key);

			request.onsuccess = () => {
				resolve(request.result ?? null);
			};
			request.onerror = () => {
				reject(new Error(`Failed to get ${key}: ${request.error?.message}`));
			};
			tx.onerror = () => {
				reject(new Error(`Transaction failed for get ${key}`));
			};
		});
	}

	async set<T>(store: string, key: string, value: T): Promise<void> {
		if (!this.db) throw new Error("IndexedDB not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(store, "readwrite");
			const objectStore = tx.objectStore(store);
			const request = objectStore.put(value, key);

			tx.oncomplete = () => resolve();
			request.onerror = () => {
				reject(new Error(`Failed to set ${key}: ${request.error?.message}`));
			};
			tx.onerror = () => {
				reject(new Error(`Transaction failed for set ${key}`));
			};
		});
	}

	async remove(store: string, key: string): Promise<void> {
		if (!this.db) throw new Error("IndexedDB not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(store, "readwrite");
			const objectStore = tx.objectStore(store);
			const request = objectStore.delete(key);

			tx.oncomplete = () => resolve();
			request.onerror = () => {
				reject(new Error(`Failed to remove ${key}: ${request.error?.message}`));
			};
			tx.onerror = () => {
				reject(new Error(`Transaction failed for remove ${key}`));
			};
		});
	}

	async getAll<T>(store: string): Promise<T[]> {
		if (!this.db) throw new Error("IndexedDB not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(store, "readonly");
			const objectStore = tx.objectStore(store);
			const request = objectStore.getAll();

			request.onsuccess = () => {
				resolve(request.result as T[]);
			};
			request.onerror = () => {
				reject(new Error(`Failed to getAll: ${request.error?.message}`));
			};
			tx.onerror = () => {
				reject(new Error(`Transaction failed for getAll`));
			};
		});
	}

	async getAllKeys(store: string): Promise<string[]> {
		if (!this.db) throw new Error("IndexedDB not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(store, "readonly");
			const objectStore = tx.objectStore(store);
			const request = objectStore.getAllKeys();

			request.onsuccess = () => {
				resolve(request.result as string[]);
			};
			request.onerror = () => {
				reject(new Error(`Failed to getAllKeys: ${request.error?.message}`));
			};
			tx.onerror = () => {
				reject(new Error(`Transaction failed for getAllKeys`));
			};
		});
	}

	async clear(): Promise<void> {
		if (!this.db) throw new Error("IndexedDB not initialized");

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(
				Array.from(this.db!.objectStoreNames),
				"readwrite",
			);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(new Error(`Failed to clear: ${tx.error?.message}`));

			for (const storeName of this.db!.objectStoreNames) {
				tx.objectStore(storeName).clear();
			}
		});
	}

	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}
