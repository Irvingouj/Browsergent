import { describe, expect, test } from "vitest";
import {
	applyWindowCloseToIndex,
	applyWindowMergeToIndex,
	applyWindowSplitToIndex,
	planCreateSessionForWindow,
	resolveActiveSessionForWindow,
	type SessionIndexSnapshot,
	sessionOpenable,
} from "../../src/controllers/session-index-lifecycle";

function snap(partial?: Partial<SessionIndexSnapshot>): SessionIndexSnapshot {
	return {
		sessions: [
			{
				id: "sa",
				windowId: 1,
				lifecycle: "foreground",
				timestamp: 100,
				messageCount: 2,
				bytes: 10,
			},
			{
				id: "sb",
				windowId: 2,
				lifecycle: "foreground",
				timestamp: 90,
				messageCount: 1,
				bytes: 5,
			},
		],
		meta: {
			panelActiveSession: { "1": "sa", "2": "sb" },
			closedWindowIds: [],
			runningSessionsByWindow: { "2": ["sb"] },
		},
		...partial,
	};
}

describe("session-index-lifecycle pure reducers", () => {
	test("B3 merge both_on_survivor rebinds removed sessions as background", () => {
		const next = applyWindowMergeToIndex(snap(), 2, 1);
		const sa = next.sessions.find((s) => s.id === "sa");
		const sb = next.sessions.find((s) => s.id === "sb");
		expect(sa?.windowId).toBe(1);
		expect(sa?.lifecycle).toBe("foreground");
		expect(sb?.windowId).toBe(1);
		expect(sb?.lifecycle).toBe("background");
		expect(next.meta.panelActiveSession["2"]).toBeUndefined();
		expect(next.meta.closedWindowIds).toContain(2);
		expect(next.meta.runningSessionsByWindow?.["2"]).toBeUndefined();
	});

	test("B2 split does not move sessions; create-for-window adds fresh FG", () => {
		const afterSplit = applyWindowSplitToIndex(snap(), 1, 3);
		expect(afterSplit.sessions.map((s) => s.windowId).sort()).toEqual([1, 2]);
		expect(resolveActiveSessionForWindow(afterSplit, 3)).toBeNull();

		const afterCreate = planCreateSessionForWindow(
			afterSplit,
			3,
			"sc-new",
			200,
		);
		const sc = afterCreate.sessions.find((s) => s.id === "sc-new");
		expect(sc?.windowId).toBe(3);
		expect(sc?.lifecycle).toBe("foreground");
		expect(afterCreate.meta.panelActiveSession["3"]).toBe("sc-new");
		// Source window unchanged
		expect(afterCreate.sessions.find((s) => s.id === "sa")?.windowId).toBe(1);
	});

	test("create-for-window demotes existing foreground on same window", () => {
		const next = planCreateSessionForWindow(snap(), 1, "sc", 300);
		expect(next.sessions.find((s) => s.id === "sa")?.lifecycle).toBe(
			"background",
		);
		expect(next.sessions.find((s) => s.id === "sc")?.lifecycle).toBe(
			"foreground",
		);
		expect(next.meta.panelActiveSession["1"]).toBe("sc");
	});

	test("B4 openable only when session window matches panel", () => {
		expect(sessionOpenable(1, 1)).toBe(true);
		expect(sessionOpenable(2, 1)).toBe(false);
		expect(sessionOpenable(null, 1)).toBe(false);
		expect(sessionOpenable(1, null)).toBe(true);
	});

	test("close marks window closed without rebinding session windowIds", () => {
		const next = applyWindowCloseToIndex(snap(), 2);
		expect(next.sessions.find((s) => s.id === "sb")?.windowId).toBe(2);
		expect(next.meta.closedWindowIds).toContain(2);
		expect(next.meta.panelActiveSession["2"]).toBeUndefined();
	});

	test("resolveActiveSessionForWindow prefers panelActive then FG", () => {
		const base = snap();
		expect(resolveActiveSessionForWindow(base, 1)).toBe("sa");
		const noPref: SessionIndexSnapshot = {
			...base,
			meta: { ...base.meta, panelActiveSession: {} },
		};
		expect(resolveActiveSessionForWindow(noPref, 1)).toBe("sa");
	});
});
