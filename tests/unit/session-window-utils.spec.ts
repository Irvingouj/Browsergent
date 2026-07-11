import { describe, expect, test } from "vitest";
import {
	canOpenSessionForWindow,
	collectRunningSessionIds,
	formatWindowLabel,
	isClaimableClosedSession,
} from "../../src/controllers/session-window-utils";

describe("session window utils", () => {
	test("formatWindowLabel shows closed suffix for merged-away windows", () => {
		const closed = new Set([42]);
		expect(formatWindowLabel(42, closed)).toBe("Window 42 (closed)");
		expect(formatWindowLabel(10, closed)).toBe("Window 10");
	});

	test("canOpenSessionForWindow rejects unbound session from a specific panel", () => {
		expect(canOpenSessionForWindow(null, 1)).toBe(false);
		expect(canOpenSessionForWindow(undefined, 1)).toBe(false);
		expect(canOpenSessionForWindow(1, 1)).toBe(true);
		expect(canOpenSessionForWindow(2, 1)).toBe(false);
	});

	test("isClaimableClosedSession: closed meta or gone from live set, not live foreign", () => {
		const closed = new Set([20]);
		expect(isClaimableClosedSession(20, 10, closed)).toBe(true);
		expect(isClaimableClosedSession(20, 10, new Set(), new Set([10]))).toBe(
			true,
		);
		expect(isClaimableClosedSession(20, 10, new Set(), new Set([10, 20]))).toBe(
			false,
		);
		// Stale closed meta must not beat a still-live Chrome window (C1 veto).
		expect(
			isClaimableClosedSession(20, 10, new Set([20]), new Set([10, 20])),
		).toBe(false);
		expect(isClaimableClosedSession(10, 10, closed)).toBe(false);
	});

	test("formatWindowLabel: live set wins over stale closed meta", () => {
		expect(formatWindowLabel(20, new Set(), new Set([10]))).toBe(
			"Window 20 (closed)",
		);
		expect(formatWindowLabel(20, new Set([20]), new Set([10, 20]))).toBe(
			"Window 20",
		);
	});

	test("collectRunningSessionIds dedupes local, persisted, and global running", () => {
		expect(
			collectRunningSessionIds(["a", "b"], ["b", "c"], { c: 1, d: 2 }).sort(),
		).toEqual(["a", "b", "c", "d"]);
	});
});
