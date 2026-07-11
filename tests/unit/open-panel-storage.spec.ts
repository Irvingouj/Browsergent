import { afterEach, describe, expect, test } from "vitest";
import "fake-indexeddb/auto";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { openPanelStorage } from "../../src/storage/open-panel-storage";
import type { StorageBackend } from "../../src/storage/storage-backend";
import { initBoundController } from "./session-test-utils";

/**
 * Public factory for production durable storage.
 * Behavior: always IndexedDB-backed, never MemoryStorage; survives close/reopen.
 */

describe("openPanelStorage", () => {
	const backends: StorageBackend[] = [];

	afterEach(async () => {
		for (const b of backends.splice(0)) {
			try {
				await b.clear();
			} catch {
				/* ok */
			}
			await b.close().catch(() => {
				/* ok */
			});
		}
	});

	test("returns a backend that round-trips set/get", async () => {
		const storage = await openPanelStorage();
		backends.push(storage);
		await storage.set("settings", "probe", "hello");
		expect(await storage.get("settings", "probe")).toBe("hello");
	});

	test("is durable across close and reopen (not MemoryStorage isolation)", async () => {
		const first = await openPanelStorage();
		backends.push(first);
		await first.set("settings", "durable-key", "persisted-value");
		await first.close();

		const second = await openPanelStorage();
		backends.push(second);
		// MemoryStorage would not see writes from a previous instance's closed maps.
		expect(await second.get("settings", "durable-key")).toBe("persisted-value");
		// Explicit: must not be the in-memory test double type.
		expect(second).not.toBeInstanceOf(MemoryStorage);
	});

	test("SessionController attaches a window session through openPanelStorage", async () => {
		const storage = await openPanelStorage();
		backends.push(storage);
		const { ctrl, sessionId } = await initBoundController(storage, 99);
		expect(sessionId.length).toBeGreaterThan(0);
		expect(ctrl.getActiveSessionId()).toBe(sessionId);
		expect(ctrl.getPanelWindowId()).toBe(99);
		const messages = [
			{
				id: "u1",
				kind: "user" as const,
				text: "from openPanelStorage",
				timestamp: 1,
			},
		];
		await ctrl.save(messages, []);
		const loaded = await ctrl.load();
		expect(loaded?.messages).toEqual(messages);
	});

	test("throws when indexedDB.open fails (no silent empty store)", async () => {
		const original = globalThis.indexedDB;
		const broken = {
			open: () => {
				const req = {
					result: null as IDBDatabase | null,
					error: { name: "UnknownError", message: "simulated open failure" },
					onsuccess: null as ((ev: Event) => void) | null,
					onerror: null as ((ev: Event) => void) | null,
					onblocked: null as ((ev: Event) => void) | null,
					onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => void) | null,
				};
				queueMicrotask(() => {
					req.onerror?.(new Event("error"));
				});
				return req as unknown as IDBOpenDBRequest;
			},
			deleteDatabase: original.deleteDatabase.bind(original),
			cmp: original.cmp.bind(original),
			databases: original.databases?.bind(original),
		};
		// Replace global for this test only.
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			value: broken,
		});
		try {
			await expect(openPanelStorage()).rejects.toThrow();
		} finally {
			Object.defineProperty(globalThis, "indexedDB", {
				configurable: true,
				value: original,
			});
		}
	});
});
