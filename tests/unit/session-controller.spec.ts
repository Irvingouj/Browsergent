import { describe, expect, test, beforeEach, vi } from "vitest";
import type { PersistData } from "@pi-oxide/pi-host-web";
import { SessionController } from "../../src/controllers/session-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";

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

	test("returns snapshot for valid data", async () => {
		const data = {
			messages: [{ kind: "user", id: "1", text: "hi", timestamp: 0 }],
			trace: [],
			timestamp: Date.now(),
		};
		await storage.set("sessions", "current", data);
		const ctrl = new SessionController(storage);
		const result = await ctrl.load();
		expect(result).not.toBeNull();
		expect(result?.messages).toEqual(data.messages);
		expect(result?.trace).toEqual(data.trace);
	});

	test("scheduleSave debounces correctly", async () => {
		vi.useFakeTimers();
		const ctrl = new SessionController(storage);
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

		expect(await ctrl.load()).toBeNull();

		await vi.advanceTimersByTimeAsync(500);
		expect(await ctrl.load()).not.toBeNull();

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
		expect(await ctrl.load()).toEqual({ messages: [], trace: [] });
	});

	test("init() migrates old sessions/current data", async () => {
		const oldData = {
			messages: [
				{ kind: "user", id: "1", text: "hello", timestamp: 1 },
			],
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
		await storage.set("history", "current", {
			id: "current",
			timestamp: 1000,
			messages: [{ role: "user", content: "hello" }],
		});

		await ctrl.init();

		expect(await storage.get("sessions", "current")).toBeNull();
		expect(await storage.get("history", "current")).toBeNull();

		const activeId = ctrl.getActiveSessionId();
		expect(activeId).not.toBeNull();

		const loaded = await ctrl.load();
		expect(loaded?.messages).toEqual(oldData.messages);
		expect(loaded?.trace).toEqual(oldData.trace);

		const history = await ctrl.loadHistory();
		expect(history).toEqual([{ role: "user", content: "hello" }]);
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
		const firstId = ctrl.getActiveSessionId();
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
		expect(await ctrl.load()).toEqual({ messages: [], trace: [] });

		// old session data should still be accessible
		const switched = await ctrl.switchSession(firstId!);
		expect(switched?.messages).toEqual(messages);
	});

	test("switchSession() changes active session", async () => {
		await ctrl.init();
		const id1 = ctrl.getActiveSessionId();
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		const id2 = await ctrl.createSession();
		await ctrl.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);

		const switched = await ctrl.switchSession(id1!);
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

		const list = await ctrl.listSessions();
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
				ids.push(ctrl.getActiveSessionId()!);
			}
			await ctrl.save(
				[{ id: `${i}`, kind: "user" as const, text: `msg${i}`, timestamp: i }],
				[],
			);
			vi.advanceTimersByTime(2);
		}
		const list = await ctrl.listSessions();
		expect(list.length).toBe(50);
		// oldest sessions should have been deleted
		const oldestId = ids[0];
		expect(list.find((l) => l.id === oldestId)).toBeUndefined();
		vi.useRealTimers();
	});

	test("deleteSession() removes session and history", async () => {
		await ctrl.init();
		const id1 = ctrl.getActiveSessionId();
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		await ctrl.saveHistory([{ role: "user", content: "hi" }]);
		const id2 = await ctrl.createSession();
		await ctrl.save(
			[{ id: "2", kind: "user" as const, text: "b", timestamp: 2 }],
			[],
		);

		await ctrl.deleteSession(id1!);
		expect(ctrl.getActiveSessionId()).toBe(id2);
		expect(await ctrl.switchSession(id1!)).toBeNull();
	});

	test("deleteSession() creates new session when last is deleted", async () => {
		await ctrl.init();
		const id = ctrl.getActiveSessionId();
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "a", timestamp: 1 }],
			[],
		);
		await ctrl.deleteSession(id!);
		const newActive = ctrl.getActiveSessionId();
		expect(newActive).not.toBeNull();
		expect(newActive).not.toBe(id);
		expect(await ctrl.load()).toEqual({ messages: [], trace: [] });
	});

	test("updateTitle() updates title", async () => {
		await ctrl.init();
		const id = ctrl.getActiveSessionId();
		await ctrl.updateTitle(id!, "My Title");
		const list = await ctrl.listSessions();
		expect(list[0].title).toBe("My Title");
	});

	test("updateTitle() with isCustom sets customTitle", async () => {
		await ctrl.init();
		const id = ctrl.getActiveSessionId();
		await ctrl.updateTitle(id!, "Custom", true);
		await ctrl.updateTitle(id!, "Ignored", false);
		const list = await ctrl.listSessions();
		expect(list[0].title).toBe("Custom");
	});

	test("clear() removes active session and history after init", async () => {
		await ctrl.init();
		await ctrl.save(
			[{ id: "1", kind: "user" as const, text: "hello", timestamp: 1 }],
			[],
		);
		await ctrl.saveHistory([{ role: "user", content: "hi" }]);
		await ctrl.clear();
		expect(await ctrl.load()).toBeNull();
		expect(await ctrl.loadHistory()).toBeNull();
	});

	test("saveHistory() / loadHistory() roundtrip after init", async () => {
		await ctrl.init();
		const history = [
			{ role: "user" as const, content: "hi" },
			{ role: "assistant" as const, content: "hello" },
		];
		await ctrl.saveHistory(history);
		const result = await ctrl.loadHistory();
		expect(result).toEqual(history);
	});

	test("loadHistory() filters invalid entries after init", async () => {
		await ctrl.init();
		const id = ctrl.getActiveSessionId();
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
		const result = await ctrl.loadHistory();
		expect(result).toEqual([{ role: "user", content: "valid" }]);
	});
});

describe("SessionController persistData", () => {
	let storage: MemoryStorage;
	let ctrl: SessionController;

	beforeEach(() => {
		storage = new MemoryStorage();
		ctrl = new SessionController(storage);
	});

	test("savePersistData saves to active session when it exists", async () => {
		await ctrl.init();
		ctrl.hydrated = true;
		const mockState = { turn_number: 0, system_prompt: "test" } as unknown as PersistData;
		await ctrl.savePersistData(mockState);
		const result = await ctrl.loadPersistData();
		expect(result).toEqual(mockState);
	});

	test("savePersistData creates minimal record when active session does not exist", async () => {
		await ctrl.init();
		ctrl.hydrated = true;
		const activeId = ctrl.getActiveSessionId()!;
		await storage.remove("sessions", `session_${activeId}`);

		const mockState = { turn_number: 1, system_prompt: "test2" } as unknown as PersistData;
		await ctrl.savePersistData(mockState);

		const data = await storage.get("sessions", `session_${activeId}`);
		expect(data).toEqual({
			id: activeId,
			messages: [],
			trace: [],
			timestamp: expect.any(Number),
			messageCount: 0,
			persistData: mockState,
		});
	});

	test("savePersistData does nothing before init", async () => {
		const mockState = { turn_number: 0, system_prompt: "test" } as unknown as PersistData;
		await ctrl.savePersistData(mockState);
		const keys = await storage.getAllKeys("sessions");
		expect(keys).toEqual([]);
	});

	test("loadPersistData returns saved state", async () => {
		await ctrl.init();
		ctrl.hydrated = true;
		const mockState = { turn_number: 2, system_prompt: "test3" } as unknown as PersistData;
		await ctrl.savePersistData(mockState);
		const result = await ctrl.loadPersistData();
		expect(result).toEqual(mockState);
	});

	test("loadPersistData returns null when no state exists", async () => {
		await ctrl.init();
		const result = await ctrl.loadPersistData();
		expect(result).toBeNull();
	});

	test("savePersistData / loadPersistData roundtrip", async () => {
		await ctrl.init();
		ctrl.hydrated = true;
		const mockState = { turn_number: 3, system_prompt: "test4" } as unknown as PersistData;
		await ctrl.savePersistData(mockState);
		const result = await ctrl.loadPersistData();
		expect(result).toEqual(mockState);
	});

	test("save preserves persistData", async () => {
		await ctrl.init();
		ctrl.hydrated = true;
		const mockState = { turn_number: 4, system_prompt: "test5" } as unknown as PersistData;
		await ctrl.savePersistData(mockState);

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

		const result = await ctrl.loadPersistData();
		expect(result).toEqual(mockState);
	});

	test("loadPersistData returns null and logs warning for old sdkSessionState shape", async () => {
		await ctrl.init();
		const activeId = ctrl.getActiveSessionId()!;
		const oldState = { projection_state: "some_state", messages: [] };
		await storage.set("sessions", `session_${activeId}`, {
			id: activeId,
			messages: [],
			trace: [],
			timestamp: Date.now(),
			messageCount: 0,
			sdkSessionState: oldState,
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await ctrl.loadPersistData();
		expect(result).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			"Old session state detected (SdkSessionState). Agent will start fresh. Chat history is preserved.",
		);
		warnSpy.mockRestore();
	});

	test("save() preserves existing persistData", async () => {
		await ctrl.init();
		ctrl.hydrated = true;
		const activeId = ctrl.getActiveSessionId()!;
		const mockState = { turn_number: 5, system_prompt: "test6" } as unknown as PersistData;
		await storage.set("sessions", `session_${activeId}`, {
			id: activeId,
			messages: [{ id: "1", kind: "user" as const, text: "hi", timestamp: 1 }],
			trace: [],
			timestamp: Date.now(),
			messageCount: 1,
			persistData: mockState,
		});

		const messages = [
			{ id: "2", kind: "user" as const, text: "hello", timestamp: 2 },
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

		const data = await storage.get("sessions", `session_${activeId}`);
		expect(data.persistData).toEqual(mockState);
	});
});
