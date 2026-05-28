import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";

import "fake-indexeddb/auto";

describe("SessionController with IndexedDB", () => {
	let storage: IndexedDBStorage;
	let controller: SessionController;

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
		controller = new SessionController(storage);
	});

	afterEach(async () => {
		if (storage && storage["db"]) {
			await storage.clear();
			await storage.close();
		}
	});

	test("load() returns null when empty", async () => {
		const result = await controller.load();
		expect(result).toBeNull();
	});

	test("save() / load() roundtrip", async () => {
		const messages = [
			{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 },
		];
		const trace = [
			{ id: "t1", step: 1, status: "done" as const, toolName: "run_lua", timestamp: 1 },
		];
		await controller.save(messages, trace);
		const result = await controller.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(messages);
		expect(result?.trace).toEqual(trace);
	});

	test("clear() removes data", async () => {
		const messages = [{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 }];
		const trace = [{ id: "t1", step: 1, status: "done" as const, toolName: "run_lua", timestamp: 1 }];
		await controller.save(messages, trace);
		await controller.saveHistory([{ role: "user" as const, content: "hi" }]);

		await controller.clear();

		expect(await controller.load()).toBeNull();
		expect(await controller.loadHistory()).toBeNull();
	});

	test("saveHistory() / loadHistory() roundtrip", async () => {
		const history = [
			{ role: "user" as const, content: "hi" },
			{ role: "assistant" as const, content: "hello" },
		];
		await controller.saveHistory(history);
		const result = await controller.loadHistory();
		expect(result).toEqual(history);
	});

	test("loadHistory() filters invalid entries", async () => {
		await storage.set("history", "current", {
			id: "current",
			timestamp: Date.now(),
			messages: [
				{ role: "user", content: "valid" },
				{ role: "invalid", content: "bad" },
				null,
				{ role: "assistant", text: "missing content" },
			],
		});
		const result = await controller.loadHistory();
		expect(result).toEqual([{ role: "user", content: "valid" }]);
	});

	test("loadHistory() returns null when empty", async () => {
		const result = await controller.loadHistory();
		expect(result).toBeNull();
	});

	test("load() rejects malformed session", async () => {
		await storage.set("sessions", "current", { messages: "not-array", trace: [] });
		const result = await controller.load();
		expect(result).toBeNull();
	});
});
