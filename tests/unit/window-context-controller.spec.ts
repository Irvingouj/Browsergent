import { describe, expect, test, vi } from "vitest";
import { lifecycleEventKey } from "../../src/sidepanel/window-context-controller";

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

		const { WindowContextController } = await import(
			"../../src/sidepanel/window-context-controller"
		);
		const { SessionController } = await import(
			"../../src/controllers/session-controller"
		);
		const { MemoryStorage } = await import(
			"../../src/storage/memory-storage"
		);

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