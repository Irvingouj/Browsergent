import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { IndexedDBStorage } from "../../src/storage/indexeddb-storage";
import {
	initBoundController,
	requireActiveId,
	transcriptFromMessages,
} from "./session-test-utils";

import "fake-indexeddb/auto";

describe("SessionController with IndexedDB (window-bound)", () => {
	let storage: IndexedDBStorage;

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
	});

	afterEach(async () => {
		if (storage?.db) {
			await storage.clear();
			await storage.close();
		}
	});

	test("load() returns empty session after bind", async () => {
		const { ctrl } = await initBoundController(storage);
		const result = await ctrl.load();
		expect(result).toEqual({ messages: [], trace: [], diagnostics: [] });
	});

	test("save() / load() roundtrip", async () => {
		const { ctrl } = await initBoundController(storage);
		const messages = [
			{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 },
		];
		const trace = [
			{
				id: "t1",
				step: 1,
				status: "done" as const,
				toolName: "run_js",
				timestamp: 1,
			},
		];
		await ctrl.save(messages, trace);
		const result = await ctrl.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(messages);
		expect(result?.trace).toEqual(trace);
	});

	test("clear() removes data", async () => {
		const { ctrl } = await initBoundController(storage);
		const messages = [
			{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 },
		];
		const trace = [
			{
				id: "t1",
				step: 1,
				status: "done" as const,
				toolName: "run_js",
				timestamp: 1,
			},
		];
		await ctrl.save(messages, trace);

		await ctrl.clear();

		expect(await ctrl.load()).toBeNull();
	});

	test("active transcript branch survives an IndexedDB reload", async () => {
		const { ctrl, sessionId } = await initBoundController(storage);
		const messages = [
			{ kind: "user" as const, id: "u1", text: "First", timestamp: 1 },
			{ kind: "assistant" as const, id: "a1", text: "Answer", timestamp: 2 },
			{ kind: "user" as const, id: "u2", text: "Second", timestamp: 3 },
		];
		await ctrl.saveForSession(
			sessionId,
			messages,
			[],
			[],
			transcriptFromMessages(messages),
		);
		await ctrl.selectTranscriptLeaf(sessionId, "u1");

		await storage.close();
		storage = new IndexedDBStorage();
		await storage.init();
		const reloaded = new SessionController(storage);
		await reloaded.init();
		const loaded = await reloaded.loadForSession(sessionId);

		expect(loaded?.history.map((entry) => entry.entryId)).toEqual(["u1"]);
		expect(Object.keys(loaded?.transcript.entries ?? {})).toHaveLength(3);
		expect(loaded?.messages).toEqual([messages[0]]);
	});

	test("load() rejects malformed session", async () => {
		const { ctrl, sessionId } = await initBoundController(storage);
		await storage.set("sessions", `session_${sessionId}`, {
			messages: "not-array",
			trace: [],
		});
		const result = await ctrl.load();
		expect(result).toBeNull();
	});
});

describe("SessionController with IndexedDB (multi-session)", () => {
	let storage: IndexedDBStorage;
	let controller: Awaited<ReturnType<typeof initBoundController>>["ctrl"];

	beforeEach(async () => {
		storage = new IndexedDBStorage();
		await storage.init();
		({ ctrl: controller } = await initBoundController(storage));
	});

	afterEach(async () => {
		if (storage?.db) {
			await storage.clear();
			await storage.close();
		}
	});

	test("resolveOrCreateForWindow creates a fresh session", async () => {
		const activeId = controller.getActiveSessionId();
		expect(activeId).not.toBeNull();
		expect(await controller.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});
	});

	test("save() / load() roundtrip", async () => {
		const messages = [
			{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 },
		];
		const trace = [
			{
				id: "t1",
				step: 1,
				status: "done" as const,
				toolName: "run_js",
				timestamp: 1,
			},
		];
		await controller.save(messages, trace);
		const result = await controller.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(messages);
		expect(result?.trace).toEqual(trace);
	});

	test("clear() removes active session", async () => {
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 }],
			[],
		);
		await controller.clear();
		expect(await controller.load()).toBeNull();
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
		expect(await controller.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});
	});

	test("switchSession() changes active session", async () => {
		const id1 = requireActiveId(controller);
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		const _id2 = await controller.createSession();
		await controller.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);
		const switched = await controller.switchSession(id1);
		expect(controller.getActiveSessionId()).toBe(id1);
		expect(switched?.messages).toEqual([
			{ id: "1", kind: "user", text: "a", timestamp: 1 },
		]);
	});

	test("deleteSession() removes session", async () => {
		const id1 = requireActiveId(controller);
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		const id2 = await controller.createSession();
		await controller.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);
		await controller.deleteSession(id1);
		expect(controller.getActiveSessionId()).toBe(id2);
		expect(await controller.switchSession(id1)).toBeNull();
	});

	test("deleteSession() creates new session when last is deleted", async () => {
		const id = requireActiveId(controller);
		await controller.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		await controller.deleteSession(id);
		const newActive = controller.getActiveSessionId();
		expect(newActive).not.toBeNull();
		expect(newActive).not.toBe(id);
		expect(await controller.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});
	});

	test("listSessions() returns sorted items", async () => {
		for (let i = 0; i < 3; i++) {
			if (i > 0) await controller.createSession();
			await controller.save(
				[{ id: `${i}`, kind: "user" as const, text: `msg${i}`, timestamp: i }],
				[],
			);
		}
		const { sessions: list } = await controller.listSessions();
		expect(list.length).toBe(3);
		expect(list[0].messageCount).toBe(1);
	});

	test("updateTitle() updates title", async () => {
		const id = requireActiveId(controller);
		await controller.updateTitle(id, "My Title");
		const { sessions: list } = await controller.listSessions();
		expect(list[0].title).toBe("My Title");
	});
});
