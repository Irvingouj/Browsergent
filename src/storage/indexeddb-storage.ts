import type { StorageBackend } from "./storage-backend";

/** Last open timing for diagnostics (panel console + tests). */
export type IdbOpenTiming = {
	openCallAt: number;
	onsuccessAt: number | null;
	onblockedAt: number | null;
	onupgradeneededAt: number | null;
	onerrorAt: number | null;
	/** ms from open() call → onsuccess (null if never succeeded) */
	openMs: number | null;
	upgraded: boolean;
	blocked: boolean;
	error: string | null;
};

/** One timed IDB operation (open / get / set / …). */
export type IdbOpTiming = {
	op: string;
	store?: string;
	key?: string;
	ms: number;
	ok: boolean;
	error?: string;
	ts: number;
	href?: string;
	queueDepth?: number;
};

const OP_RING_MAX = 200;
const opRing: IdbOpTiming[] = [];
let lastOpenTiming: IdbOpenTiming | null = null;
let opSeq = 0;

export function getLastIdbOpenTiming(): IdbOpenTiming | null {
	return lastOpenTiming;
}

/** Recent IDB ops in this document (for tests / diagnostics). */
export function getIdbOpRing(): readonly IdbOpTiming[] {
	return opRing;
}

export function clearIdbOpRing(): void {
	opRing.length = 0;
}

function pushOp(entry: IdbOpTiming): void {
	opRing.push(entry);
	if (opRing.length > OP_RING_MAX) {
		opRing.splice(0, opRing.length - OP_RING_MAX);
	}
}

function idbLog(phase: string, extra?: Record<string, unknown>): void {
	const payload = extra ? ` ${JSON.stringify(extra)}` : "";
	console.info(`[idb-timing] ${phase}${payload}`);
}

function pageHref(): string {
	try {
		return typeof location !== "undefined" ? location.href : "";
	} catch {
		return "";
	}
}

/**
 * Serial queue for all IndexedDB work in this document.
 *
 * Concurrent callers (boot + session list + running sync) used to open many
 * overlapping IDB transactions; that amplified multi-window stalls. Every
 * public method on IndexedDBStorage goes through this chain so ops run one at
 * a time in FIFO order.
 */
export class IndexedDBStorage implements StorageBackend {
	private db: IDBDatabase | null = null;
	private readonly dbName = "browsergent";
	private readonly version = 2;

	/** Tail of the serial queue. Never reject the chain itself. */
	private queue: Promise<unknown> = Promise.resolve();
	private pending = 0;

	/**
	 * Enqueue work so only one IDB op runs at a time in this panel document.
	 * Errors reject the caller but do not break subsequent queue items.
	 */
	private enqueue<T>(
		op: string,
		meta: { store?: string; key?: string },
		fn: () => Promise<T>,
	): Promise<T> {
		const seq = ++opSeq;
		this.pending += 1;
		const depth = this.pending;
		const t0 = performance.now();
		idbLog("op_start", {
			seq,
			op,
			store: meta.store,
			key: meta.key,
			queueDepth: depth,
			href: pageHref(),
		});

		const run = this.queue.then(async () => {
			try {
				const result = await fn();
				const ms = Math.round(performance.now() - t0);
				pushOp({
					op,
					store: meta.store,
					key: meta.key,
					ms,
					ok: true,
					ts: Date.now(),
					href: pageHref(),
					queueDepth: depth,
				});
				idbLog("op_done", {
					seq,
					op,
					store: meta.store,
					key: meta.key,
					ms,
					ok: true,
					queueDepth: depth,
				});
				if (ms >= 50) {
					idbLog("op_slow", {
						seq,
						op,
						store: meta.store,
						key: meta.key,
						ms,
						queueDepth: depth,
					});
				}
				return result;
			} catch (err) {
				const ms = Math.round(performance.now() - t0);
				const message = err instanceof Error ? err.message : String(err);
				pushOp({
					op,
					store: meta.store,
					key: meta.key,
					ms,
					ok: false,
					error: message,
					ts: Date.now(),
					href: pageHref(),
					queueDepth: depth,
				});
				idbLog("op_done", {
					seq,
					op,
					store: meta.store,
					key: meta.key,
					ms,
					ok: false,
					error: message,
					queueDepth: depth,
				});
				throw err;
			} finally {
				this.pending = Math.max(0, this.pending - 1);
			}
		});

		// Advance queue even if this op failed.
		this.queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/** Open the DB (queued). */
	async init(): Promise<void> {
		return this.enqueue("open", {}, () => this.openRaw());
	}

	private openRaw(): Promise<void> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const openCallAt = performance.now();
			const wallStart = Date.now();
			const timing: IdbOpenTiming = {
				openCallAt: wallStart,
				onsuccessAt: null,
				onblockedAt: null,
				onupgradeneededAt: null,
				onerrorAt: null,
				openMs: null,
				upgraded: false,
				blocked: false,
				error: null,
			};
			lastOpenTiming = timing;

			idbLog("open_call", {
				db: this.dbName,
				version: this.version,
				href: pageHref(),
			});

			const settle = (fn: () => void) => {
				if (settled) return;
				settled = true;
				fn();
			};

			const request = indexedDB.open(this.dbName, this.version);

			request.onupgradeneeded = (event) => {
				timing.onupgradeneededAt = Date.now();
				timing.upgraded = true;
				idbLog("onupgradeneeded", {
					ms: Math.round(performance.now() - openCallAt),
					oldVersion: event.oldVersion,
					newVersion: event.newVersion,
				});
				const db = (event.target as IDBOpenDBRequest).result;
				const oldVersion = event.oldVersion;

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
				}
			};

			request.onsuccess = (event) => {
				const ms = Math.round(performance.now() - openCallAt);
				timing.onsuccessAt = Date.now();
				timing.openMs = ms;
				idbLog("onsuccess", { openMs: ms });
				settle(() => {
					this.db = (event.target as IDBOpenDBRequest).result;
					this.db.onversionchange = () => {
						idbLog("onversionchange", {});
						this.db?.close();
						this.db = null;
					};
					resolve();
				});
			};

			request.onerror = () => {
				const ms = Math.round(performance.now() - openCallAt);
				const msg = `${request.error?.name ?? "Error"}: ${request.error?.message ?? "unknown"}`;
				timing.onerrorAt = Date.now();
				timing.error = msg;
				idbLog("onerror", { ms, error: msg });
				settle(() => {
					reject(new Error(`Failed to open IndexedDB: ${msg}`));
				});
			};

			request.onblocked = () => {
				const ms = Math.round(performance.now() - openCallAt);
				timing.onblockedAt = Date.now();
				timing.blocked = true;
				idbLog("onblocked", { ms });
				// Do not reject forever — wait for eventual success/error.
				// Versionchange peers must close; we only log.
			};
		});
	}

	async get<T>(store: string, key: string): Promise<T | null> {
		return this.enqueue("get", { store, key }, () => {
			if (!this.db) throw new Error("IndexedDB not initialized");
			const db = this.db;
			return new Promise<T | null>((resolve, reject) => {
				const tx = db.transaction(store, "readonly");
				const objectStore = tx.objectStore(store);
				const request = objectStore.get(key);

				request.onsuccess = () => {
					resolve((request.result as T | undefined) ?? null);
				};
				request.onerror = () => {
					reject(new Error(`Failed to get ${key}: ${request.error?.message}`));
				};
				tx.onerror = () => {
					reject(new Error(`Transaction failed for get ${key}`));
				};
			});
		});
	}

	async set<T>(store: string, key: string, value: T): Promise<void> {
		return this.enqueue("set", { store, key }, () => {
			if (!this.db) throw new Error("IndexedDB not initialized");
			const db = this.db;
			return new Promise<void>((resolve, reject) => {
				const tx = db.transaction(store, "readwrite");
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
		});
	}

	async remove(store: string, key: string): Promise<void> {
		return this.enqueue("remove", { store, key }, () => {
			if (!this.db) throw new Error("IndexedDB not initialized");
			const db = this.db;
			return new Promise<void>((resolve, reject) => {
				const tx = db.transaction(store, "readwrite");
				const objectStore = tx.objectStore(store);
				const request = objectStore.delete(key);

				tx.oncomplete = () => resolve();
				request.onerror = () => {
					reject(
						new Error(`Failed to remove ${key}: ${request.error?.message}`),
					);
				};
				tx.onerror = () => {
					reject(new Error(`Transaction failed for remove ${key}`));
				};
			});
		});
	}

	async getAll<T>(store: string): Promise<T[]> {
		return this.enqueue("getAll", { store }, () => {
			if (!this.db) throw new Error("IndexedDB not initialized");
			const db = this.db;
			return new Promise<T[]>((resolve, reject) => {
				const tx = db.transaction(store, "readonly");
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
		});
	}

	async getAllKeys(store: string): Promise<string[]> {
		return this.enqueue("getAllKeys", { store }, () => {
			if (!this.db) throw new Error("IndexedDB not initialized");
			const db = this.db;
			return new Promise<string[]>((resolve, reject) => {
				const tx = db.transaction(store, "readonly");
				const objectStore = tx.objectStore(store);
				const request = objectStore.getAllKeys();

				request.onsuccess = () => {
					resolve(request.result as string[]);
				};
				request.onerror = () => {
					reject(
						new Error(`Failed to getAllKeys: ${request.error?.message}`),
					);
				};
				tx.onerror = () => {
					reject(new Error(`Transaction failed for getAllKeys`));
				};
			});
		});
	}

	async clear(): Promise<void> {
		return this.enqueue("clear", {}, () => {
			if (!this.db) throw new Error("IndexedDB not initialized");
			const db = this.db;
			return new Promise<void>((resolve, reject) => {
				const tx = db.transaction(Array.from(db.objectStoreNames), "readwrite");
				tx.oncomplete = () => resolve();
				tx.onerror = () =>
					reject(new Error(`Failed to clear: ${tx.error?.message}`));

				for (const storeName of db.objectStoreNames) {
					tx.objectStore(storeName).clear();
				}
			});
		});
	}

	async close(): Promise<void> {
		return this.enqueue("close", {}, async () => {
			idbLog("close", { href: pageHref() });
			if (this.db) {
				this.db.close();
				this.db = null;
			}
		});
	}
}
