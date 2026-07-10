import { beforeEach, describe, expect, test, vi } from "vitest";
import { SessionController } from "../../src/controllers/session-controller";
import {
	lifecycleEventKey,
	resetWindowIdCacheForTests,
	WindowContextController,
} from "../../src/sidepanel/window-context-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";
import type { ChatMessage } from "../../src/types/messages";

describe("lifecycleEventKey", () => {
	test("dedupes merge events from runtime and storage transports", () => {
		const runtime = {
			type: "windowLifecycle" as const,
			kind: "merge" as const,
			removedWindowId: 2,
			survivorWindowId: 1,
		};
		const storage = { ...runtime, emittedAt: 12345 };
		expect(lifecycleEventKey(runtime)).toBe(lifecycleEventKey(storage));
	});
});

describe("WindowContextController.init attach path (B1/B2)", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
		resetWindowIdCacheForTests();
	});

	test("re-init on same windowId restores panelActive session (does not mint a new one)", async () => {
		const ctrl1 = new SessionController(storage);
		await ctrl1.init();
		const ctx1 = new WindowContextController(ctrl1);
		const first = await ctx1.init({ windowId: 42 });

		expect(first.windowId).toBe(42);
		expect(first.sessionId.length).toBeGreaterThan(0);
		expect(ctrl1.getPanelActiveSessionId(42)).toBe(first.sessionId);
		// Panel must be bound so getActiveSessionId() works (handleRun gate).
		expect(ctrl1.getPanelWindowId()).toBe(42);
		expect(ctrl1.getActiveSessionId()).toBe(first.sessionId);

		const userMsg: ChatMessage = {
			kind: "user",
			id: "u1",
			text: "prior chat in window 42",
			timestamp: 1,
		};
		await ctrl1.saveForSession(first.sessionId, [userMsg], [], []);

		// Simulate panel reopen: new controller stack, same storage.
		const ctrl2 = new SessionController(storage);
		await ctrl2.init();
		const ctx2 = new WindowContextController(ctrl2);
		const second = await ctx2.init({ windowId: 42 });

		expect(second.sessionId).toBe(first.sessionId);
		expect(ctrl2.getPanelActiveSessionId(42)).toBe(first.sessionId);
		// B1 restore path incomplete without bindPanelWindow — Run would no-op.
		expect(ctrl2.getPanelWindowId()).toBe(42);
		expect(ctrl2.getActiveSessionId()).toBe(second.sessionId);
		expect(ctx2.getWindowId()).toBe(42);

		const loaded = await ctrl2.loadForSession(second.sessionId);
		expect(loaded?.messages).toEqual([userMsg]);
	});

	test("init for different windowIds attaches independent sessions", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const ctx = new WindowContextController(ctrl);

		const a = await ctx.init({ windowId: 10 });
		// New controller instance for second window (each panel has its own).
		const ctrlB = new SessionController(storage);
		await ctrlB.init();
		const ctxB = new WindowContextController(ctrlB);
		const b = await ctxB.init({ windowId: 20 });

		expect(a.sessionId).not.toBe(b.sessionId);
		expect(ctrl.getPanelActiveSessionId(10)).toBe(a.sessionId);
		expect(ctrlB.getPanelActiveSessionId(20)).toBe(b.sessionId);
	});

	test("init reuses panelActive without createSessionAttachedToFast", async () => {
		const ctrl = new SessionController(storage);
		await ctrl.init();
		const first = await ctrl.resolveOrCreateForWindow(7);

		// Fresh controller stack: meta loaded, panel window unbound until init.
		const ctrl2 = new SessionController(storage);
		await ctrl2.init();
		expect(ctrl2.getPanelWindowId()).toBeNull();
		expect(ctrl2.getActiveSessionId()).toBeNull();
		expect(ctrl2.getPanelActiveSessionId(7)).toBe(first);

		const createFastSpy = vi.spyOn(ctrl2, "createSessionAttachedToFast");
		const adoptSpy = vi.spyOn(ctrl2, "adoptEphemeralSession");

		const ctx = new WindowContextController(ctrl2);
		const result = await ctx.init({ windowId: 7 });

		// Existing panelActive is returned without minting a new session (B1).
		expect(result.sessionId).toBe(first);
		expect(createFastSpy).not.toHaveBeenCalled();
		expect(adoptSpy).not.toHaveBeenCalled();
		// bindPanelWindow required for getActiveSessionId / handleRun.
		expect(ctrl2.getPanelWindowId()).toBe(7);
		expect(ctrl2.getActiveSessionId()).toBe(first);
	});
});

describe("WindowContextController lifecycle dedupe", () => {
	test("subscribeLifecycle delivers the same merge only once", async () => {
		vi.stubGlobal("chrome", {
			runtime: {
				onMessage: {
					addListener: vi.fn(),
					removeListener: vi.fn(),
				},
			},
			storage: {
				session: {
					onChanged: {
						addListener: vi.fn(),
						removeListener: vi.fn(),
					},
				},
			},
		});

		resetWindowIdCacheForTests();
		const storage = new MemoryStorage();
		const ctrl = new SessionController(storage);
		const ctx = new WindowContextController(ctrl);
		const seen: string[] = [];
		ctx.subscribeLifecycle((message) => {
			seen.push(message.kind);
		});

		const runtimeListener = (
			chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>
		).mock.calls[0]?.[0] as (message: unknown) => void;
		const storageListener = (
			chrome.storage.session.onChanged.addListener as ReturnType<
				typeof vi.fn
			>
		).mock.calls[0]?.[0] as (
			changes: Record<string, { newValue: unknown }>,
			areaName: string,
		) => void;

		const merge = {
			type: "windowLifecycle",
			kind: "merge",
			removedWindowId: 2,
			survivorWindowId: 1,
		};
		runtimeListener(merge);
		storageListener(
			{
				windowLifecycleEvent: { ...merge, emittedAt: Date.now() },
			},
			"session",
		);

		expect(seen).toEqual(["merge"]);
		vi.unstubAllGlobals();
	});
});
