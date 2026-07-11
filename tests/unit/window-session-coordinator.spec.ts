import { describe, expect, test } from "vitest";
import {
	decisionToLifecycleMessage,
	WindowLifecycleTracker,
} from "../../src/background/window-lifecycle-tracker";
import {
	PanelRegistry,
	WindowSessionCoordinatorLogic,
} from "../../src/background/window-session-coordinator";

describe("WindowSessionCoordinatorLogic", () => {
	const logic = new WindowSessionCoordinatorLogic();

	test("split: source window keeps session, new windowId is announced unbound", () => {
		const msg = logic.emitSplit(1, 2);
		expect(msg).toEqual({
			type: "windowLifecycle",
			kind: "split",
			sourceWindowId: 1,
			newWindowId: 2,
		});
	});

	test("merge: announces removed and survivor window ids", () => {
		const msg = logic.emitMerge(2, 1);
		expect(msg).toEqual({
			type: "windowLifecycle",
			kind: "merge",
			removedWindowId: 2,
			survivorWindowId: 1,
		});
	});

	test("merge: includes rebound running sessions from removed window panel", () => {
		const msg = logic.emitMerge(2, 1, ["sb-1", "sb-2"]);
		expect(msg.reboundRunningSessionIds).toEqual(["sb-1", "sb-2"]);
	});

	test("close: announces removed window without survivor", () => {
		const msg = logic.emitClose(9);
		expect(msg).toEqual({
			type: "windowLifecycle",
			kind: "close",
			removedWindowId: 9,
		});
	});
});

describe("coordinator tracker + registry integration", () => {
	test("merge path attaches rebound running from removed panel", () => {
		const tracker = new WindowLifecycleTracker();
		const registry = new PanelRegistry();
		tracker.onTabDetached(1, 2);
		tracker.onTabAttached(1, 10);
		tracker.finalizeDeferredAttach();
		registry.register(2, "sb");
		registry.updateRunning(2, ["sb-run"]);
		const rebound = registry.unregister(2).running;
		const decision = tracker.onWindowRemoved(2);
		const message = decisionToLifecycleMessage(decision, rebound);
		expect(message).toEqual({
			type: "windowLifecycle",
			kind: "merge",
			removedWindowId: 2,
			survivorWindowId: 10,
			reboundRunningSessionIds: ["sb-run"],
		});
	});

	test("bare close path emits close without rebound", () => {
		const tracker = new WindowLifecycleTracker();
		const registry = new PanelRegistry();
		registry.register(5, "sx");
		registry.unregister(5);
		const decision = tracker.onWindowRemoved(5);
		expect(decisionToLifecycleMessage(decision)).toEqual({
			type: "windowLifecycle",
			kind: "close",
			removedWindowId: 5,
		});
	});
});

describe("PanelRegistry", () => {
	test("register and unregister tracks panel presence", () => {
		const registry = new PanelRegistry();
		registry.register(10, "sa");
		expect(registry.hasPanel(10)).toBe(true);
		const removed = registry.unregister(10);
		expect(removed.running).toEqual([]);
		expect(registry.hasPanel(10)).toBe(false);
	});

	test("updateRunning builds global map for cross-window badges", () => {
		const registry = new PanelRegistry();
		registry.register(1, "sa");
		registry.register(2, "sb");
		registry.updateRunning(1, ["sa"]);
		registry.updateRunning(2, ["sb-headless"]);
		expect(registry.buildGlobalRunningMap()).toEqual({
			sa: 1,
			"sb-headless": 2,
		});
	});

	test("unregister captures running sessions for merge rebound", () => {
		const registry = new PanelRegistry();
		registry.register(2, "sb");
		registry.updateRunning(2, ["sb-run"]);
		const removed = registry.unregister(2);
		expect(removed.running).toEqual(["sb-run"]);
		expect(registry.buildGlobalRunningMap()).toEqual({});
	});
});
