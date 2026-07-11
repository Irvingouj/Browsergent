import { describe, expect, test } from "vitest";
import {
	canOpenSessionForWindow,
	collectRunningSessionIds,
	formatWindowLabel,
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

	test("collectRunningSessionIds dedupes local, persisted, and global running", () => {
		expect(
			collectRunningSessionIds(["a", "b"], ["b", "c"], { c: 1, d: 2 }).sort(),
		).toEqual(["a", "b", "c", "d"]);
	});
});
