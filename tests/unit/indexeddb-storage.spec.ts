import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";

// fake-indexeddb polyfills the global indexedDB object
import "fake-indexeddb/auto";

describe("IndexedDBStorage", () => {
	let storage: IndexedDBStorage;

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
	});

	afterEach(async () => {
		if (storage && storage["db"]) {
			await storage.clear();
			await storage.close();
		}
	});

	test("get returns null for missing key", async () => {
		const result = await storage.get("settings", "missing");
		expect(result).toBeNull();
	});

	test("set and get roundtrip", async () => {
		await storage.set("settings", "apiKey", "sk-123");
		const result = await storage.get("settings", "apiKey");
		expect(result).toBe("sk-123");
	});

	test("remove deletes key", async () => {
		await storage.set("settings", "apiKey", "sk-123");
		await storage.remove("settings", "apiKey");
		const result = await storage.get("settings", "apiKey");
		expect(result).toBeNull();
	});

	test("getAll returns all records in a store", async () => {
		await storage.set("settings", "a", 1);
		await storage.set("settings", "b", 2);
		const all = await storage.getAll("settings");
		expect(all).toHaveLength(2);
		expect(all.sort()).toEqual([1, 2]);
	});

	test("getAll returns empty array for empty store", async () => {
		const all = await storage.getAll("sessions");
		expect(all).toEqual([]);
	});

	test("clear removes all data", async () => {
		await storage.set("settings", "a", 1);
		await storage.set("sessions", "b", 2);
		await storage.clear();
		expect(await storage.get("settings", "a")).toBeNull();
		expect(await storage.get("sessions", "b")).toBeNull();
	});

	test("set updates existing key", async () => {
		await storage.set("settings", "x", 1);
		await storage.set("settings", "x", 2);
		const result = await storage.get("settings", "x");
		expect(result).toBe(2);
	});

	test("works across multiple stores", async () => {
		await storage.set("settings", "k", "settings-val");
		await storage.set("sessions", "k", "sessions-val");
		expect(await storage.get("settings", "k")).toBe("settings-val");
		expect(await storage.get("sessions", "k")).toBe("sessions-val");
	});

	test("throws when not initialized", async () => {
		const fresh = new IndexedDBStorage();
		await expect(fresh.get("settings", "x")).rejects.toThrow(
			"not initialized",
		);
	});

	test("init recovers after close", async () => {
		await storage.set("settings", "k", "recovered-value");
		await storage.close();

		const fresh = new IndexedDBStorage();
		await fresh.init();
		const result = await fresh.get("settings", "k");
		expect(result).toBe("recovered-value");
		await fresh.close();
	});

	test("set and get roundtrip with primitives", async () => {
		await storage.set("settings", "str", "hello");
		await storage.set("settings", "num", 42);
		await storage.set("settings", "bool", true);
		await storage.set("settings", "nil", null);
		expect(await storage.get("settings", "str")).toBe("hello");
		expect(await storage.get("settings", "num")).toBe(42);
		expect(await storage.get("settings", "bool")).toBe(true);
		expect(await storage.get("settings", "nil")).toBeNull();
	});
});
