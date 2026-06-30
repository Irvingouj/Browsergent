import { describe, expect, test } from "vitest";
import {
	interpretKey,
	resolveInputMode,
} from "../../src/sidepanel/components/input/input-mode";

// ---------------------------------------------------------------------------
// Slice 1 — picker-at Enter with items → select-active
// ---------------------------------------------------------------------------
describe("interpretKey — picker Enter selects active item", () => {
	const ctx = {
		itemCount: 2,
		caretAtStart: false,
		caretAtEnd: false,
		isRunning: false,
	};

	test("Enter in picker-at with items > 0 returns select-active", () => {
		const result = interpretKey(
			{
				kind: "picker-at",
				query: "test",
				startIndex: 0,
				endIndex: 5,
				activeIndex: 0,
			},
			{ key: "Enter", shiftKey: false } as KeyboardEvent,
			ctx,
		);
		expect(result).toEqual({
			type: "prevent-default",
			effect: "select-active",
			nextMode: { kind: "plain" },
		});
	});

	test("Enter in picker-slash with items > 0 returns select-active", () => {
		const result = interpretKey(
			{ kind: "picker-slash", query: "skill", startIndex: 0, activeIndex: 2 },
			{ key: "Enter", shiftKey: false } as KeyboardEvent,
			{ ...ctx, itemCount: 5 },
		);
		expect(result).toEqual({
			type: "prevent-default",
			effect: "select-active",
			nextMode: { kind: "plain" },
		});
	});
});

// ---------------------------------------------------------------------------
// Slice 2 — plain Enter submits
// ---------------------------------------------------------------------------
describe("interpretKey — plain-mode Enter", () => {
	test("Enter without Shift and not running submits", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "Enter", shiftKey: false } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toEqual({
			type: "prevent-default",
			effect: "submit",
		});
	});

	test("Shift+Enter returns null (allow default newline)", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "Enter", shiftKey: true } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toBeNull();
	});

	test("Enter while running returns null (don't submit)", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "Enter", shiftKey: false } as KeyboardEvent,
			{ itemCount: 0, caretAtStart: false, caretAtEnd: false, isRunning: true },
		);
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Slice 3 — ArrowDown moves activeIndex and resolveInputMode preserves it
// ---------------------------------------------------------------------------
describe("interpretKey — ArrowDown/ArrowUp in picker", () => {
	const baseCtx = {
		itemCount: 3,
		caretAtStart: false,
		caretAtEnd: false,
		isRunning: false,
	};

	test("ArrowDown increments activeIndex", () => {
		const result = interpretKey(
			{
				kind: "picker-at",
				query: "f",
				startIndex: 0,
				endIndex: 2,
				activeIndex: 0,
			},
			{ key: "ArrowDown" } as KeyboardEvent,
			baseCtx,
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			nextMode: { kind: "picker-at", activeIndex: 1 },
		});
	});

	test("ArrowDown clamps at last item", () => {
		const result = interpretKey(
			{
				kind: "picker-at",
				query: "f",
				startIndex: 0,
				endIndex: 2,
				activeIndex: 2,
			},
			{ key: "ArrowDown" } as KeyboardEvent,
			baseCtx,
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			nextMode: { kind: "picker-at", activeIndex: 2 },
		});
	});

	test("ArrowUp decrements activeIndex", () => {
		const result = interpretKey(
			{ kind: "picker-slash", query: "s", startIndex: 0, activeIndex: 2 },
			{ key: "ArrowUp" } as KeyboardEvent,
			baseCtx,
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			nextMode: { kind: "picker-slash", activeIndex: 1 },
		});
	});

	test("ArrowUp clamps at 0", () => {
		const result = interpretKey(
			{
				kind: "picker-at",
				query: "f",
				startIndex: 0,
				endIndex: 2,
				activeIndex: 0,
			},
			{ key: "ArrowUp" } as KeyboardEvent,
			baseCtx,
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			nextMode: { kind: "picker-at", activeIndex: 0 },
		});
	});
});

describe("resolveInputMode — regression guard", () => {
	test("carries activeIndex when mode and query are unchanged", () => {
		const prev: InputMode = {
			kind: "picker-at",
			query: "doc",
			startIndex: 0,
			endIndex: 4,
			activeIndex: 1,
		};
		const result = resolveInputMode("@doc", 4, prev);
		expect(result).toEqual({
			kind: "picker-at",
			query: "doc",
			startIndex: 0,
			endIndex: 4,
			activeIndex: 1,
		});
	});

	test("resets activeIndex to 0 when query changes", () => {
		const prev: InputMode = {
			kind: "picker-at",
			query: "doc",
			startIndex: 0,
			endIndex: 4,
			activeIndex: 1,
		};
		const result = resolveInputMode("@d", 2, prev);
		expect(result).toMatchObject({ kind: "picker-at", activeIndex: 0 });
	});

	test("resets activeIndex when mode changes from picker-at to picker-slash", () => {
		const prev: InputMode = {
			kind: "picker-at",
			query: "doc",
			startIndex: 0,
			endIndex: 4,
			activeIndex: 2,
		};
		const result = resolveInputMode("/skill", 1, prev);
		expect(result).toMatchObject({ kind: "picker-slash", activeIndex: 0 });
	});
});

// ---------------------------------------------------------------------------
// Slice 4 — Enter with zero picker items falls through to submit
// ---------------------------------------------------------------------------
describe("interpretKey — zero-item picker Enter fallthrough", () => {
	test("picker-at Enter with 0 items submits instead of select-active", () => {
		const result = interpretKey(
			{
				kind: "picker-at",
				query: "zzz",
				startIndex: 0,
				endIndex: 4,
				activeIndex: 0,
			},
			{ key: "Enter", shiftKey: false } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toEqual({ type: "prevent-default", effect: "submit" });
	});

	test("picker-slash Enter with 0 items submits", () => {
		const result = interpretKey(
			{ kind: "picker-slash", query: "zzz", startIndex: 0, activeIndex: 0 },
			{ key: "Enter", shiftKey: false } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toEqual({ type: "prevent-default", effect: "submit" });
	});
});

// ---------------------------------------------------------------------------
// Slice 5 — Escape dismisses picker, blur in plain
// ---------------------------------------------------------------------------
describe("interpretKey — Escape", () => {
	test("picker-at Escape dismisses picker (no blur)", () => {
		const result = interpretKey(
			{
				kind: "picker-at",
				query: "f",
				startIndex: 0,
				endIndex: 2,
				activeIndex: 0,
			},
			{ key: "Escape" } as KeyboardEvent,
			{
				itemCount: 5,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "dismiss-picker",
			nextMode: { kind: "plain" },
		});
	});

	test("picker-slash Escape dismisses picker", () => {
		const result = interpretKey(
			{ kind: "picker-slash", query: "s", startIndex: 0, activeIndex: 0 },
			{ key: "Escape" } as KeyboardEvent,
			{
				itemCount: 2,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "dismiss-picker",
			nextMode: { kind: "plain" },
		});
	});
});

// ---------------------------------------------------------------------------
// Slice 7 — history recall via mode
// ---------------------------------------------------------------------------
describe("interpretKey — history recall", () => {
	test("ArrowUp at caret 0 in plain enters history recall (older)", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "ArrowUp" } as KeyboardEvent,
			{ itemCount: 0, caretAtStart: true, caretAtEnd: false, isRunning: false },
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "recall-history",
			recallDirection: "older",
			nextMode: { kind: "history", index: -1, savedDraft: "" },
		});
	});

	test("ArrowDown at EOL in history recalls newer", () => {
		const result = interpretKey(
			{ kind: "history", index: 0, savedDraft: "my draft" },
			{ key: "ArrowDown" } as KeyboardEvent,
			{ itemCount: 0, caretAtStart: false, caretAtEnd: true, isRunning: false },
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "recall-history",
			recallDirection: "newer",
		});
	});

	test("Escape in history restores draft and returns to plain", () => {
		const result = interpretKey(
			{ kind: "history", index: 2, savedDraft: "hello" },
			{ key: "Escape" } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "restore-draft",
			nextMode: { kind: "plain" },
		});
	});
});

// ---------------------------------------------------------------------------
// Slice 8a — text-editing commands in plain/history
// ---------------------------------------------------------------------------
describe("interpretKey — text-editing commands", () => {
	test("Ctrl+Backspace returns delete-word", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "Backspace", ctrlKey: true } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "delete-word",
		});
	});

	test("Alt+Backspace returns delete-word", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "Backspace", altKey: true } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "delete-word",
		});
	});

	test("Ctrl+K returns delete-to-eol", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "k", ctrlKey: true } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "delete-to-eol",
		});
	});

	test("Ctrl+Shift+K returns delete-line", () => {
		const result = interpretKey(
			{ kind: "plain" },
			{ key: "k", ctrlKey: true, shiftKey: true } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "delete-line",
		});
	});

	test("text-edit commands also work in history mode", () => {
		const result = interpretKey(
			{ kind: "history", index: 0, savedDraft: "draft" },
			{ key: "Backspace", altKey: true } as KeyboardEvent,
			{
				itemCount: 0,
				caretAtStart: false,
				caretAtEnd: false,
				isRunning: false,
			},
		);
		expect(result).toMatchObject({
			type: "prevent-default",
			effect: "delete-word",
		});
	});
});
