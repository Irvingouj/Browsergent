import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { collectRunningSessionIds } from "../../src/controllers/session-window-utils";
import { browsergentStore } from "../../src/state/store";

/**
 * Regression: running-session callbacks must not imply full listSessions (IDB getAllKeys).
 * This file documents the contract used by app.tsx onRunningSessionsChanged handler.
 */
describe("second-window running badge contract", () => {
	beforeEach(() => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().sessionListLoaded([
			{
				id: "s-a",
				title: "A",
				timestamp: 1,
				messageCount: 0,
				windowId: 1,
				windowLabel: "Window 1",
				lifecycle: "foreground",
				openable: true,
				running: false,
			},
			{
				id: "s-b",
				title: "B",
				timestamp: 2,
				messageCount: 0,
				windowId: 2,
				windowLabel: "Window 2",
				lifecycle: "foreground",
				openable: true,
				running: false,
			},
		]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("collectRunningSessionIds merges local and global without list reload", () => {
		const ids = collectRunningSessionIds(["s-b"], ["s-a"], { "s-a": 1 });
		expect(ids.sort()).toEqual(["s-a", "s-b"]);
		const runningSet = new Set(ids);
		const current = browsergentStore.getState().session.sessions;
		const patched = current.map((s) => ({
			...s,
			running: runningSet.has(s.id),
		}));
		expect(patched.find((s) => s.id === "s-a")?.running).toBe(true);
		expect(patched.find((s) => s.id === "s-b")?.running).toBe(true);
		// No SessionController.listSessions in this path — contract for badge-only updates.
	});
});
