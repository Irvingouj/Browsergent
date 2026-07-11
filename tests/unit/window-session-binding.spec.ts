import { beforeEach, describe, expect, test } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";

describe("SessionController window attachment", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("resolveOrCreateForWindow creates independent sessions per windowId", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const s42 = await ctrl.resolveOrCreateForWindow(42);
		const s99 = await ctrl.resolveOrCreateForWindow(99);

		expect(s42).not.toBe(s99);
		expect(ctrl.getPanelActiveSessionId(42)).toBe(s42);
		expect(ctrl.getPanelActiveSessionId(99)).toBe(s99);
	});

	test("save for window 42 does not overwrite window 99 session", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const s42 = await ctrl.resolveOrCreateForWindow(42);
		const s99 = await ctrl.resolveOrCreateForWindow(99);

		ctrl.bindPanelWindow(42);
		await ctrl.save(
			[{ kind: "user", id: "1", text: "hello A", timestamp: 1 }],
			[],
		);

		ctrl.bindPanelWindow(99);
		const loaded99 = await ctrl.loadForSession(s99);
		expect(loaded99?.messages).toEqual([]);

		const loaded42 = await ctrl.loadForSession(s42);
		expect(loaded42?.messages).toEqual([
			{ kind: "user", id: "1", text: "hello A", timestamp: 1 },
		]);
	});

	test("canOpenSession returns false when session.windowId !== panel windowId", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const s42 = await ctrl.resolveOrCreateForWindow(42);
		expect(await ctrl.canOpenSession(s42, 42)).toBe(true);
		expect(await ctrl.canOpenSession(s42, 99)).toBe(false);
	});

	test("two sessions attached to same windowId are both openable from that panel", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		ctrl.bindPanelWindow(7);
		const sa = await ctrl.resolveOrCreateForWindow(7);
		const sb = await ctrl.createSessionAttachedTo(7);

		expect(sa).not.toBe(sb);
		expect(await ctrl.canOpenSession(sa, 7)).toBe(true);
		expect(await ctrl.canOpenSession(sb, 7)).toBe(true);
	});

	test("createSessionAttachedTo keeps prior session on same window attached as background", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const sa = await ctrl.resolveOrCreateForWindow(5);
		const sb = await ctrl.createSessionAttachedTo(5);

		const dataA = await ctrl.getSessionRecord(sa);
		const dataB = await ctrl.getSessionRecord(sb);
		expect(dataA?.windowId).toBe(5);
		expect(dataB?.windowId).toBe(5);
		expect(dataA?.lifecycle).toBe("background");
		expect(dataB?.lifecycle).toBe("foreground");
	});

	test("applyWindowMerge rebinds removed window sessions to survivor as background", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const sa = await ctrl.resolveOrCreateForWindow(1);
		const sb = await ctrl.resolveOrCreateForWindow(2);

		await ctrl.applyWindowMerge(2, 1);

		const dataA = await ctrl.getSessionRecord(sa);
		const dataB = await ctrl.getSessionRecord(sb);
		expect(dataA?.windowId).toBe(1);
		expect(dataA?.lifecycle).toBe("foreground");
		expect(dataB?.windowId).toBe(1);
		expect(dataB?.lifecycle).toBe("background");
	});

	test("split child window first panel open creates fresh session without inheriting parent chat", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		const sa = await ctrl.resolveOrCreateForWindow(1);
		ctrl.bindPanelWindow(1);
		await ctrl.save(
			[{ kind: "user", id: "u1", text: "parent window chat", timestamp: 1 }],
			[],
		);

		const sb = await ctrl.resolveOrCreateForWindow(2);
		expect(sb).not.toBe(sa);
		const child = await ctrl.loadForSession(sb);
		expect(child?.messages).toEqual([]);
		ctrl.bindPanelWindow(1);
		const parent = await ctrl.loadForSession(sa);
		expect(parent?.messages).toEqual([
			{ kind: "user", id: "u1", text: "parent window chat", timestamp: 1 },
		]);
	});

	test("applyWindowClose marks window closed without rebindings sessions", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const sb = await ctrl.resolveOrCreateForWindow(20);
		await ctrl.applyWindowClose(20);
		const record = await ctrl.getSessionRecord(sb);
		expect(record?.windowId).toBe(20);
		const { sessions } = await ctrl.listSessions(10);
		const row = sessions.find((s) => s.id === sb);
		expect(row?.windowLabel).toBe("Window 20 (closed)");
		expect(row?.openable).toBe(false);
		expect(row?.claimable).toBe(true);
	});

	test("claimClosedSession rebinds same id onto panel window and becomes openable", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const sa = await ctrl.resolveOrCreateForWindow(10);
		const sb = await ctrl.resolveOrCreateForWindow(20);
		ctrl.bindPanelWindow(20);
		await ctrl.save(
			[{ kind: "user", id: "u-b", text: "from window B", timestamp: 1 }],
			[],
		);
		await ctrl.applyWindowClose(20);

		ctrl.bindPanelWindow(10);
		const before = await ctrl.listSessions(10);
		expect(before.sessions.find((s) => s.id === sb)?.claimable).toBe(true);
		expect(before.sessions.find((s) => s.id === sb)?.openable).toBe(false);

		const claimed = await ctrl.claimClosedSession(sb);
		expect(claimed).toEqual({ ok: true });
		const record = await ctrl.getSessionRecord(sb);
		expect(record?.windowId).toBe(10);
		expect(record?.lifecycle).toBe("background");
		expect(record?.id).toBe(sb); // R1: same id

		const after = await ctrl.listSessions(10);
		const row = after.sessions.find((s) => s.id === sb);
		expect(row?.openable).toBe(true);
		expect(row?.claimable).toBe(false);

		const data = await ctrl.switchSession(sb);
		expect(data?.messages.some((m) => m.text === "from window B")).toBe(true);
		expect(sa).toBeTruthy();
	});

	test("claimClosedSession refuses live foreign windows (C1)", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		await ctrl.resolveOrCreateForWindow(10);
		const sb = await ctrl.resolveOrCreateForWindow(20);
		// B still "open" — not in closedWindowIds and still in live set
		ctrl.bindPanelWindow(10);
		const { sessions } = await ctrl.listSessions(10, {
			liveWindowIds: [10, 20],
		});
		expect(sessions.find((s) => s.id === sb)?.claimable).toBe(false);
		expect(
			await ctrl.claimClosedSession(sb, { liveWindowIds: [10, 20] }),
		).toEqual({ ok: false, reason: "live_foreign" });
		expect((await ctrl.getSessionRecord(sb))?.windowId).toBe(20);
	});

	test("claimClosedSession refuses stale closed when window still live", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		await ctrl.resolveOrCreateForWindow(10);
		const sb = await ctrl.resolveOrCreateForWindow(20);
		await ctrl.applyWindowClose(20); // closed meta set, but Chrome still has 20
		ctrl.bindPanelWindow(10);
		const { sessions } = await ctrl.listSessions(10, {
			liveWindowIds: [10, 20],
		});
		expect(sessions.find((s) => s.id === sb)?.claimable).toBe(false);
		expect(
			await ctrl.claimClosedSession(sb, { liveWindowIds: [10, 20] }),
		).toEqual({ ok: false, reason: "live_foreign" });
	});

	test("claimClosedSession allows orphan when window gone even without close event", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		await ctrl.resolveOrCreateForWindow(10);
		const sb = await ctrl.resolveOrCreateForWindow(20);
		ctrl.bindPanelWindow(10);
		// No applyWindowClose — only live set proves 20 is gone (real merge gap).
		const { sessions } = await ctrl.listSessions(10, { liveWindowIds: [10] });
		const row = sessions.find((s) => s.id === sb);
		expect(row?.claimable).toBe(true);
		expect(row?.windowLabel).toBe("Window 20 (closed)");
		expect(await ctrl.claimClosedSession(sb, { liveWindowIds: [10] })).toEqual({
			ok: true,
		});
		expect((await ctrl.getSessionRecord(sb))?.windowId).toBe(10);
	});

	test("runningSessionsByWindow in meta is visible across panel reloads", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		await ctrl.updateRunningSessionsForWindow(42, ["session-a"]);
		const reloaded = new SessionController(storage);
		await reloaded.init();
		expect(reloaded.getGlobalRunningSessionIds()).toEqual(["session-a"]);
	});

	test("listSessions marks openable from panel windowId", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();

		await ctrl.resolveOrCreateForWindow(10);
		const sb = await ctrl.resolveOrCreateForWindow(20);

		const { sessions } = await ctrl.listSessions(10);
		const rowB = sessions.find((s) => s.id === sb);
		expect(rowB?.openable).toBe(false);
		expect(rowB?.windowLabel).toMatch(/Window 20/);
	});
});
