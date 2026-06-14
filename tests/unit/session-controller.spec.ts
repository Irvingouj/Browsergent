import { beforeEach, describe, expect, test, vi } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";

function requireActiveId(ctrl: SessionController): string {
	const id = ctrl.getActiveSessionId();
	if (id === null) throw new Error("no active session");
	return id;
}

describe("SessionController.load", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("returns null for non-object storage data", async () => {
		await storage.set("sessions", "current", "not an object");
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).toBeNull();
	});

	test("returns null when messages is not an array", async () => {
		await storage.set("sessions", "current", {
			messages: "not an array",
			trace: [],
			timestamp: Date.now(),
		});
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).toBeNull();
	});

	test("returns null when trace is not an array", async () => {
		await storage.set("sessions", "current", {
			messages: [],
			trace: "not an array",
			timestamp: Date.now(),
		});
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).toBeNull();
	});

	test("returns snapshot for valid data after init", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const messages = [{ kind: "user", id: "1", text: "hi", timestamp: 0 }];
		const trace: never[] = [];
		await ctrl.save(messages, trace);
		const result = await ctrl.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(messages);
		expect(result?.trace).toEqual(trace);
	});

	test("scheduleSave debounces correctly", async () => {
		vi.useFakeTimers();
		const ctrl = new SessionController(storage);
		await ctrl.init();
		ctrl.hydrated = true;

		const messages = [
			{ id: "1", kind: "user" as const, text: "a", timestamp: 1 },
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

		ctrl.scheduleSave(messages, trace);
		ctrl.scheduleSave(messages, trace);
		ctrl.scheduleSave(messages, trace);

		expect(await ctrl.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});

		await vi.advanceTimersByTimeAsync(500);
		expect(await ctrl.load()).toEqual({ messages, trace, diagnostics: [] });

		vi.useRealTimers();
	});

	test("flushSave persists immediately without waiting for debounce", async () => {
		vi.useFakeTimers();
		const ctrl = new SessionController(storage);
		await ctrl.init();
		ctrl.hydrated = true;

		const messages = [
			{ id: "1", kind: "user" as const, text: "saved", timestamp: 1 },
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

		ctrl.scheduleSave(messages, trace);
		await ctrl.flushSave(messages, trace);

		expect(await ctrl.load()).toEqual({ messages, trace, diagnostics: [] });

		vi.useRealTimers();
	});
});

describe("SessionController multi-session", () => {
	let storage: MemoryStorage;
	let ctrl: SessionController;

	beforeEach(() => {
		storage = new MemoryStorage();
		ctrl = new SessionController(storage);
	});

	test("init() creates fresh meta when storage is empty", async () => {
		await ctrl.init();
		const activeId = ctrl.getActiveSessionId();
		expect(activeId).not.toBeNull();
		expect(typeof activeId).toBe("string");
		expect(activeId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		expect(await ctrl.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});
	});

	test("init() migrates old sessions/current data", async () => {
		const oldData = {
			messages: [{ kind: "user", id: "1", text: "hello", timestamp: 1 }],
			trace: [
				{
					id: "t1",
					step: 1,
					status: "done",
					toolName: "run_js",
					timestamp: 1,
				},
			],
			timestamp: 1000,
		};
		await storage.set("sessions", "current", oldData);
		await ctrl.init();

		expect(await storage.get("sessions", "current")).toBeNull();

		const activeId = ctrl.getActiveSessionId();
		expect(activeId).not.toBeNull();

		const loaded = await ctrl.load();
		expect(loaded?.messages).toEqual(oldData.messages);
		expect(loaded?.trace).toEqual(oldData.trace);
	});

	test("save() and load() roundtrip after init", async () => {
		await ctrl.init();
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

	test("createSession() creates a new session and switches active", async () => {
		await ctrl.init();
		const firstId = requireActiveId(ctrl);
		const messages = [
			{ id: "1", kind: "user" as const, text: "first", timestamp: 1 },
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

		const newId = await ctrl.createSession();
		expect(newId).not.toBeNull();
		expect(newId).not.toBe(firstId);
		expect(ctrl.getActiveSessionId()).toBe(newId);
		expect(await ctrl.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});

		// old session data should still be accessible
		const switched = await ctrl.switchSession(firstId);
		expect(switched?.messages).toEqual(messages);
	});

	test("switchSession() changes active session", async () => {
		await ctrl.init();
		const id1 = requireActiveId(ctrl);
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		const _id2 = await ctrl.createSession();
		await ctrl.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);

		const switched = await ctrl.switchSession(id1);
		expect(ctrl.getActiveSessionId()).toBe(id1);
		expect(switched?.messages).toEqual([
			{ id: "1", kind: "user", text: "a", timestamp: 1 },
		]);
	});

	test("listSessions() returns sorted items and respects cap", async () => {
		await ctrl.init();
		for (let i = 0; i < 3; i++) {
			if (i > 0) await ctrl.createSession();
			await ctrl.save(
				[{ id: `${i}`, kind: "user" as const, text: `msg${i}`, timestamp: i }],
				[],
			);
		}

		const { sessions: list } = await ctrl.listSessions();
		expect(list.length).toBe(3);
		expect(list[0].messageCount).toBe(1);
		expect(list.map((l) => l.messageCount)).toEqual([1, 1, 1]);
	});

	test("listSessions() auto-trims sessions beyond cap", async () => {
		vi.useFakeTimers();
		await ctrl.init();
		const ids: string[] = [];
		for (let i = 0; i < 52; i++) {
			if (i > 0) {
				const id = await ctrl.createSession();
				ids.push(id);
			} else {
				ids.push(requireActiveId(ctrl));
			}
			await ctrl.save(
				[{ id: `${i}`, kind: "user" as const, text: `msg${i}`, timestamp: i }],
				[],
			);
			vi.advanceTimersByTime(2);
		}
		const { sessions: list } = await ctrl.listSessions();
		expect(list.length).toBe(50);
		// oldest sessions should have been deleted
		const oldestId = ids[0];
		expect(list.find((l) => l.id === oldestId)).toBeUndefined();
		vi.useRealTimers();
	});

	test("listSessions() returns pruned session ids", async () => {
		vi.useFakeTimers();
		await ctrl.init();
		const ids: string[] = [];
		for (let i = 0; i < 52; i++) {
			if (i > 0) {
				const id = await ctrl.createSession();
				ids.push(id);
			} else {
				ids.push(requireActiveId(ctrl));
			}
			await ctrl.save(
				[{ id: `${i}`, kind: "user" as const, text: `msg${i}`, timestamp: i }],
				[],
			);
			vi.advanceTimersByTime(2);
		}
		const { sessions: list, prunedIds } = await ctrl.listSessions();
		expect(list.length).toBe(50);
		expect(prunedIds).toHaveLength(2);
		expect(prunedIds).toContain(ids[0]);
		expect(prunedIds).toContain(ids[1]);
		vi.useRealTimers();
	});

	test("deleteSession() removes session", async () => {
		await ctrl.init();
		const id1 = requireActiveId(ctrl);
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		const id2 = await ctrl.createSession();
		await ctrl.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);

		await ctrl.deleteSession(id1);
		expect(ctrl.getActiveSessionId()).toBe(id2);
		expect(await ctrl.switchSession(id1)).toBeNull();
	});

	test("deleteSession() creates new session when last is deleted", async () => {
		await ctrl.init();
		const id = requireActiveId(ctrl);
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		await ctrl.deleteSession(id);
		const newActive = ctrl.getActiveSessionId();
		expect(newActive).not.toBeNull();
		expect(newActive).not.toBe(id);
		expect(await ctrl.load()).toEqual({
			messages: [],
			trace: [],
			diagnostics: [],
		});
	});

	test("updateTitle() updates title", async () => {
		await ctrl.init();
		const id = requireActiveId(ctrl);
		await ctrl.updateTitle(id, "My Title");
		const { sessions: list } = await ctrl.listSessions();
		expect(list[0].title).toBe("My Title");
	});

	test("updateTitle() with isCustom sets customTitle", async () => {
		await ctrl.init();
		const id = requireActiveId(ctrl);
		await ctrl.updateTitle(id, "Custom", true);
		await ctrl.updateTitle(id, "Ignored", false);
		const { sessions: list } = await ctrl.listSessions();
		expect(list[0].title).toBe("Custom");
	});

	test("clear() removes active session after init", async () => {
		await ctrl.init();
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 }],
			[],
		);
		await ctrl.clear();
		expect(await ctrl.load()).toBeNull();
	});
});

describe("SessionController diagnostics", () => {
	test("persists full model context", async () => {
		const storage = new MemoryStorage();
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const longText = "context".repeat(20_000);
		const diagnostics = [
			{
				kind: "model_response" as const,
				timestamp: 1,
				providerStopReason: "end_turn",
				sdkStopReason: "end" as const,
				content: [{ type: "text" as const, text: longText }],
			},
		];

		await ctrl.save([], [], diagnostics);

		expect((await ctrl.load())?.diagnostics).toEqual(diagnostics);
	});
});
