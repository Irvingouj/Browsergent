import { describe, expect, test } from "vitest";
import {
	decisionToLifecycleMessage,
	WindowLifecycleTracker,
} from "../../src/background/window-lifecycle-tracker";

describe("WindowLifecycleTracker", () => {
	test("tab attach to newly created window emits split", () => {
		const tracker = new WindowLifecycleTracker();
		tracker.onTabDetached(1, 10);
		tracker.onWindowCreated(20);
		const decision = tracker.onTabAttached(1, 20);
		expect(decision).toEqual({
			action: "split",
			sourceWindowId: 10,
			newWindowId: 20,
		});
	});

	test("tab attach to existing window defers merge until finalized", () => {
		const tracker = new WindowLifecycleTracker();
		tracker.onTabDetached(5, 2);
		expect(tracker.onTabAttached(5, 1)).toEqual({ action: "none" });
		expect(tracker.finalizeDeferredAttach()).toEqual({
			action: "none",
			mergePending: { removedWindowId: 2, survivorWindowId: 1 },
		});
		expect(tracker.onWindowRemoved(2)).toEqual({
			action: "merge",
			removedWindowId: 2,
			survivorWindowId: 1,
		});
	});

	test("attach before onWindowCreated classifies as split not merge", () => {
		const tracker = new WindowLifecycleTracker();
		tracker.onTabDetached(1, 10);
		expect(tracker.onTabAttached(1, 20)).toEqual({ action: "none" });
		expect(tracker.onWindowCreated(20)).toEqual({
			action: "split",
			sourceWindowId: 10,
			newWindowId: 20,
		});
		expect(tracker.finalizeDeferredAttach()).toEqual({ action: "none" });
		expect(tracker.onWindowRemoved(10)).toEqual({
			action: "close",
			removedWindowId: 10,
		});
	});

	test("window removed without merge target emits close not merge", () => {
		const tracker = new WindowLifecycleTracker();
		expect(tracker.onWindowRemoved(99)).toEqual({
			action: "close",
			removedWindowId: 99,
		});
	});

	test("removed tab clears pending detach to avoid spurious split", () => {
		const tracker = new WindowLifecycleTracker();
		tracker.onTabDetached(7, 3);
		tracker.onTabRemoved(7);
		tracker.onWindowCreated(40);
		expect(tracker.onTabAttached(7, 40)).toEqual({ action: "none" });
	});

	test("hasMergeTarget reflects deferred merge state", () => {
		const tracker = new WindowLifecycleTracker();
		expect(tracker.hasMergeTarget(2)).toBe(false);
		tracker.onTabDetached(1, 2);
		tracker.onTabAttached(1, 10);
		tracker.finalizeDeferredAttach();
		expect(tracker.hasMergeTarget(2)).toBe(true);
		expect(tracker.consumeMerge(2).action).toBe("merge");
		expect(tracker.hasMergeTarget(2)).toBe(false);
	});

	test("consumeMerge clears pending merge target", () => {
		const tracker = new WindowLifecycleTracker();
		tracker.onTabDetached(1, 2);
		tracker.onTabAttached(1, 10);
		tracker.finalizeDeferredAttach();
		expect(tracker.consumeMerge(2)).toEqual({
			action: "merge",
			removedWindowId: 2,
			survivorWindowId: 10,
		});
		expect(tracker.consumeMerge(2)).toEqual({
			action: "close",
			removedWindowId: 2,
		});
	});

	test("decisionToLifecycleMessage maps close kind", () => {
		const msg = decisionToLifecycleMessage({
			action: "close",
			removedWindowId: 5,
		});
		expect(msg).toEqual({
			type: "windowLifecycle",
			kind: "close",
			removedWindowId: 5,
		});
	});
});