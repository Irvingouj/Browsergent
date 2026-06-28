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

describe("SessionController diagnostics trimming", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("trims oversized diagnostics array on save", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		// Generate many large diagnostic events that exceed the size threshold
		const hugeText = "x".repeat(6000);
		const diagnostics: Array<{
			kind: "model_response";
			timestamp: number;
			providerStopReason: string;
			sdkStopReason: "end";
			content: Array<{ type: "text"; text: string }>;
		}> = [];
		for (let i = 0; i < 150; i++) {
			diagnostics.push({
				kind: "model_response",
				timestamp: i,
				providerStopReason: "end_turn",
				sdkStopReason: "end",
				content: [{ type: "text", text: hugeText }],
			});
		}

		await ctrl.save([], [], diagnostics);

		const loaded = await ctrl.load();
		if (!loaded) throw new Error("missing session");
		expect(loaded.diagnostics.length).toBeLessThan(diagnostics.length);
		expect(loaded.diagnostics[0]?.timestamp).toBeGreaterThan(0);
		expect(loaded.diagnostics[loaded.diagnostics.length - 1]?.timestamp).toBe(
			149,
		);
	});

	test("trims provider_sse_event data in persisted diagnostics", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const hugeData = "raw_sse_chunk_".repeat(2000); // ~28KB
		const diagnostics = [
			{
				kind: "provider_sse_event" as const,
				timestamp: 1,
				eventType: "content_block_delta",
				data: hugeData,
			},
			{
				kind: "provider_sse_remainder" as const,
				timestamp: 2,
				data: hugeData,
			},
		];

		await ctrl.save([], [], diagnostics);

		const loaded = await ctrl.load();
		if (!loaded) throw new Error("missing session");
		const sseEvent = loaded.diagnostics.find(
			(d): d is (typeof diagnostics)[0] => d.kind === "provider_sse_event",
		);
		const remainder = loaded.diagnostics.find(
			(d): d is (typeof diagnostics)[1] => d.kind === "provider_sse_remainder",
		);
		if (!sseEvent) throw new Error("missing SSE event");
		if (!remainder) throw new Error("missing SSE remainder");
		expect(sseEvent.data.length).toBeLessThan(hugeData.length);
		expect(sseEvent.data.length).toBeLessThanOrEqual(10000);
		expect(sseEvent.data).toContain("[truncated");
		expect(remainder.data.length).toBeLessThan(hugeData.length);
		expect(remainder.data.length).toBeLessThanOrEqual(10000);
		expect(remainder.data).toContain("[truncated");
	});

	test("trims old persisted provider_sse_event data on load", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const id = requireActiveId(ctrl);
		const hugeData = "raw_sse_chunk_".repeat(2000);
		await storage.set("sessions", `session_${id}`, {
			id,
			messages: [],
			trace: [],
			diagnostics: [
				{
					kind: "provider_sse_event" as const,
					timestamp: 1,
					eventType: "content_block_delta",
					data: hugeData,
				},
			],
			timestamp: 1,
			messageCount: 0,
		});

		const loaded = await ctrl.load();

		const [event] = loaded?.diagnostics ?? [];
		expect(event?.kind).toBe("provider_sse_event");
		if (event?.kind !== "provider_sse_event") throw new Error("missing event");
		expect(event.data.length).toBeLessThan(hugeData.length);
		expect(event.data.length).toBeLessThanOrEqual(10000);
		expect(event.data).toContain("[truncated");
		expect((await ctrl.load())?.diagnostics).toEqual(loaded?.diagnostics);
	});

	test("init trims oldest non-active sessions when stored sessions are too large", async () => {
		const activeId = "s11";
		await storage.set("sessions", "__meta", { activeSessionId: activeId });
		const hugeText = "x".repeat(6000);
		for (let i = 0; i < 12; i++) {
			await storage.set("sessions", `session_s${i}`, {
				id: `s${i}`,
				messages: [],
				trace: [],
				diagnostics: Array.from({ length: 150 }, (_, j) => ({
					kind: "model_response" as const,
					timestamp: j,
					providerStopReason: "end_turn",
					sdkStopReason: "end" as const,
					content: [{ type: "text" as const, text: hugeText }],
				})),
				timestamp: i,
				messageCount: 0,
			});
		}

		const ctrl = new SessionController(storage);
		await ctrl.init();

		const { sessions } = await ctrl.listSessions();
		expect(sessions.some((session) => session.id === activeId)).toBe(true);
		expect(sessions.some((session) => session.id === "s0")).toBe(false);
		expect(sessions.length).toBeLessThan(12);
	});

	test("recovers from storage set failure by dropping diagnostics", async () => {
		// A storage backend that fails on the first set call with non-empty diagnostics
		let firstDiagnosticsSet = true;
		const flakyStorage = new MemoryStorage();
		const origSet = flakyStorage.set.bind(flakyStorage);
		flakyStorage.set = async <T>(
			store: string,
			key: string,
			value: T,
		): Promise<void> => {
			const diagnosticsValue =
				typeof value === "object" && value !== null && "diagnostics" in value
					? (value as Record<string, unknown>).diagnostics
					: null;
			if (
				firstDiagnosticsSet &&
				Array.isArray(diagnosticsValue) &&
				diagnosticsValue.length > 0
			) {
				firstDiagnosticsSet = false;
				throw new DOMException("QuotaExceededError", "QuotaExceededError");
			}
			return origSet(store, key, value);
		};

		const ctrl = new SessionController(flakyStorage);
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
		const diagnostics = [
			{
				kind: "model_response" as const,
				timestamp: 1,
				providerStopReason: "end_turn",
				sdkStopReason: "end" as const,
				content: [{ type: "text" as const, text: "some text" }],
			},
		];

		await ctrl.save(messages, trace, diagnostics);

		const loaded = await ctrl.load();
		// Messages and trace must survive
		expect(loaded?.messages).toEqual(messages);
		expect(loaded?.trace).toEqual(trace);
		// Diagnostics should have been dropped on retry
		expect(loaded?.diagnostics.length).toBe(0);
	});

	test("drops a single oversized diagnostic event entirely", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const hugeBody = "x".repeat(600_000);
		const diagnostics = [
			{
				kind: "provider_request" as const,
				timestamp: 1,
				body: hugeBody,
			},
		];

		await ctrl.save([], [], diagnostics);

		const loaded = await ctrl.load();
		if (!loaded) throw new Error("missing session");
		expect(loaded.diagnostics.length).toBe(0);
	});

	test("does not truncate data exactly at threshold", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const exactData = "y".repeat(10000);
		const diagnostics = [
			{
				kind: "provider_sse_event" as const,
				timestamp: 1,
				eventType: "content_block_delta",
				data: exactData,
			},
		];

		await ctrl.save([], [], diagnostics);

		const loaded = await ctrl.load();
		if (!loaded) throw new Error("missing session");
		expect(loaded.diagnostics.length).toBe(1);
		const event = loaded.diagnostics[0];
		if (event?.kind !== "provider_sse_event") throw new Error("missing event");
		expect(event.data).toBe(exactData);
		expect(event.data).not.toContain("[truncated");
		expect(event.data.length).toBe(10000);
	});

	test("createSession trims oldest non-active sessions when over budget", async () => {
		const activeId = "keep-me";
		await storage.set("sessions", "__meta", { activeSessionId: activeId });
		const hugeText = "x".repeat(6000);
		// Seed enough sessions to be under budget after init but pushable over by adding more.
		for (let i = 0; i < 12; i++) {
			await storage.set("sessions", `session_s${i}`, {
				id: `s${i}`,
				messages: [],
				trace: [],
				diagnostics: Array.from({ length: 150 }, (_, j) => ({
					kind: "model_response" as const,
					timestamp: j,
					providerStopReason: "end_turn",
					sdkStopReason: "end" as const,
					content: [{ type: "text" as const, text: hugeText }],
				})),
				timestamp: i,
				messageCount: 0,
			});
		}

		const ctrl = new SessionController(storage);
		await ctrl.init(); // trims down to budget

		// Push back over budget by re-seeding large sessions the controller does not yet know about.
		for (let i = 100; i < 112; i++) {
			await storage.set("sessions", `session_late${i}`, {
				id: `late${i}`,
				messages: [],
				trace: [],
				diagnostics: Array.from({ length: 150 }, () => ({
					kind: "model_response" as const,
					timestamp: i,
					providerStopReason: "end_turn",
					sdkStopReason: "end" as const,
					content: [{ type: "text" as const, text: hugeText }],
				})),
				timestamp: i,
				messageCount: 0,
			});
		}

		const before = (await ctrl.listSessions()).sessions.length;
		await ctrl.createSession();
		const after = (await ctrl.listSessions()).sessions.length;

		// createSession must have evicted some non-active session to bring the store under budget.
		expect(after).toBeLessThan(before);
		// The originally-active session is NOT protected after createSession (meta moved to the new id),
		// but the newly-created session IS present.
		const ids = (await ctrl.listSessions()).sessions.map((s) => s.id);
		expect(ctrl.getActiveSessionId()).not.toBeNull();
		expect(ids).toContain(ctrl.getActiveSessionId());
	});

	test("already-truncated provider_sse_remainder is not re-truncated", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const id = requireActiveId(ctrl);
		// A remainder event whose data already ends with the truncated marker.
		const alreadyTruncated = `${"partial_".repeat(500)}... [truncated 4999964 bytes]`;
		await storage.set("sessions", `session_${id}`, {
			id,
			messages: [],
			trace: [],
			diagnostics: [
				{
					kind: "provider_sse_remainder" as const,
					timestamp: 1,
					data: alreadyTruncated,
				},
			],
			timestamp: 1,
			messageCount: 0,
		});

		const first = await ctrl.load();
		const second = await ctrl.load();

		const [event] = first?.diagnostics ?? [];
		expect(event?.kind).toBe("provider_sse_remainder");
		if (event?.kind !== "provider_sse_remainder")
			throw new Error("missing event");
		// Data preserved verbatim — no double truncation.
		expect(event.data).toBe(alreadyTruncated);
		// Second load is stable (idempotent — not flagged as changed again).
		expect(second?.diagnostics).toEqual(first?.diagnostics);
	});

	test("load returns data even when normalization write-back fails", async () => {
		const failOnce = { value: false };
		const flaky = new MemoryStorage();
		const origSet = flaky.set.bind(flaky);
		flaky.set = async <T>(
			store: string,
			key: string,
			value: T,
		): Promise<void> => {
			// Fail the write-back set (the one inside loadForId), which is fire-and-forget.
			const diags =
				typeof value === "object" && value !== null && "diagnostics" in value
					? (value as Record<string, unknown>).diagnostics
					: null;
			if (
				failOnce.value &&
				store === "sessions" &&
				key.startsWith("session_") &&
				Array.isArray(diags) &&
				diags.length > 0
			) {
				failOnce.value = false;
				throw new DOMException("QuotaExceededError", "QuotaExceededError");
			}
			return origSet(store, key, value);
		};

		const ctrl = new SessionController(flaky);
		await ctrl.init();
		const id = requireActiveId(ctrl);
		const hugeData = "raw_sse_chunk_".repeat(2000);
		await flaky.set("sessions", `session_${id}`, {
			id,
			messages: [{ id: "m1", kind: "user" as const, text: "hi", timestamp: 1 }],
			trace: [],
			diagnostics: [
				{
					kind: "provider_sse_event" as const,
					timestamp: 1,
					eventType: "content_block_delta",
					data: hugeData,
				},
			],
			timestamp: 1,
			messageCount: 1,
		});

		// load() must still return data even though the write-back set throws.
		failOnce.value = true;
		const loaded = await ctrl.load();
		expect(loaded).not.toBeNull();
		expect(loaded?.messages.length).toBe(1);
		expect(loaded?.diagnostics.length).toBe(1);
		const [ev] = loaded?.diagnostics ?? [];
		expect(ev?.kind).toBe("provider_sse_event");
	});
});
