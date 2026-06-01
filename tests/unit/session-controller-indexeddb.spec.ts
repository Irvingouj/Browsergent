import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";

import "fake-indexeddb/auto";

describe("SessionController with IndexedDB (backward compat)", () => {
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
			{ id: "t1", step: 1, status: "done" as const, toolName: "run_js", timestamp: 1 },
		];
		await controller.save(messages, trace);
		const result = await controller.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(messages);
		expect(result?.trace).toEqual(trace);
	});

	test("clear() removes data", async () => {
		const messages = [{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 }];
		const trace = [{ id: "t1", step: 1, status: "done" as const, toolName: "run_js", timestamp: 1 }];
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

describe("SessionController with IndexedDB (multi-session)", () => {
	let storage: IndexedDBStorage;
	let controller: SessionController;

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
		controller = new SessionController(storage);
		await controller.init();
	});

	afterEach(async () => {
		if (storage && storage["db"]) {
			await storage.clear();
			await storage.close();
		}
	});

	test("init() creates a fresh session", async () => {
		const activeId = controller.getActiveSessionId();
		expect(activeId).not.toBeNull();
		expect(await controller.load()).toEqual({ messages: [], trace: [] });
	});

	test("save() / load() roundtrip", async () => {
		const messages = [
			{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 },
		];
		const trace = [
			{ id: "t1", step: 1, status: "done" as const, toolName: "run_js", timestamp: 1 },
		];
		await controller.save(messages, trace);
		const result = await controller.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(messages);
		expect(result?.trace).toEqual(trace);
	});

	test("clear() removes active session and history", async () => {
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 }],
			[],
		);
		await controller.saveHistory([{ role: "user" as const, content: "hi" }]);
		await controller.clear();
		expect(await controller.load()).toBeNull();
		expect(await controller.loadHistory()).toBeNull();
	});

	test("createSession() creates a new session and switches active", async () => {
		const firstId = controller.getActiveSessionId();
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "first", timestamp: 1 }],
			[],
		);
		const newId = await controller.createSession();
		expect(newId).not.toBe(firstId);
		expect(controller.getActiveSessionId()).toBe(newId);
		expect(await controller.load()).toEqual({ messages: [], trace: [] });
	});

	test("switchSession() changes active session", async () => {
		const id1 = controller.getActiveSessionId();
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		const id2 = await controller.createSession();
		await controller.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);
		const switched = await controller.switchSession(id1!);
		expect(controller.getActiveSessionId()).toBe(id1);
		expect(switched?.messages).toEqual([
			{ id: "1", kind: "user", text: "a", timestamp: 1 },
		]);
	});

	test("deleteSession() removes session and history", async () => {
		const id1 = controller.getActiveSessionId();
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		await controller.saveHistory([{ role: "user", content: "hi" }]);
		const id2 = await controller.createSession();
		await controller.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);
		await controller.deleteSession(id1!);
		expect(controller.getActiveSessionId()).toBe(id2);
		expect(await controller.switchSession(id1!)).toBeNull();
	});

	test("deleteSession() creates new session when last is deleted", async () => {
		const id = controller.getActiveSessionId();
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		await controller.deleteSession(id!);
		const newActive = controller.getActiveSessionId();
		expect(newActive).not.toBeNull();
		expect(newActive).not.toBe(id);
		expect(await controller.load()).toEqual({ messages: [], trace: [] });
	});

	test("listSessions() returns sorted items", async () => {
		for (let i = 0; i < 3; i++) {
			if (i > 0) await controller.createSession();
			await controller.save(
				[{ id: `${i}`, kind: "user" as const, text: `msg${i}`, timestamp: i }],
				[],
			);
		}
		const list = await controller.listSessions();
		expect(list.length).toBe(3);
		expect(list[0].messageCount).toBe(1);
	});

	test("updateTitle() updates title", async () => {
		const id = controller.getActiveSessionId();
		await controller.updateTitle(id!, "My Title");
		const list = await controller.listSessions();
		expect(list[0].title).toBe("My Title");
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
		const id = controller.getActiveSessionId();
		await storage.set("history", `session_${id}`, {
			id: `session_${id}`,
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
});
