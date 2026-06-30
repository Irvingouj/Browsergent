import { describe, expect, test } from "vitest";
import {
	applyCommand,
	assertNever,
	type Draft,
	emptyDraft,
	parseDraft,
	parseDraftAtOffset,
	serializeDraft,
} from "../../src/sidepanel/components/input/draft-model";

const fileChip = {
	kind: "chip" as const,
	chipKind: "file" as const,
	raw: "@[file:f1:readme.md]",
	label: "readme.md",
	title: "readme.md",
};

describe("emptyDraft", () => {
	test("has empty left and right", () => {
		expect(emptyDraft()).toEqual({ left: [], right: [] });
	});
});

describe("applyCommand — insert-chip", () => {
	test("inserts chip before cursor (cursor at end)", () => {
		const draft: Draft = {
			left: [{ kind: "text", value: "hi " }],
			right: [],
		};
		const result = applyCommand(draft, {
			kind: "insert-chip",
			inline: fileChip,
		});
		expect(result).toEqual({
			kind: "draft-updated",
			draft: {
				left: [{ kind: "text", value: "hi " }, fileChip],
				right: [],
			},
		});
	});

	test("inserts chip at cursor position (cursor mid-draft)", () => {
		const draft: Draft = {
			left: [{ kind: "text", value: "ab" }],
			right: [{ kind: "text", value: "cd" }],
		};
		const result = applyCommand(draft, {
			kind: "insert-chip",
			inline: fileChip,
		});
		expect(result).toEqual({
			kind: "draft-updated",
			draft: {
				left: [{ kind: "text", value: "ab" }, fileChip],
				right: [{ kind: "text", value: "cd" }],
			},
		});
	});
});

describe("applyCommand — replace-from-history", () => {
	test("replaces entire draft, cursor at end", () => {
		const draft = {
			left: [{ kind: "text" as const, value: "current" }],
			right: [],
		};
		const history: Draft = {
			left: [{ kind: "text", value: "past task" }],
			right: [],
		};
		const result = applyCommand(draft, {
			kind: "replace-from-history",
			draft: history,
		});
		expect(result).toEqual({ kind: "draft-updated", draft: history });
	});
});

describe("applyCommand — submit", () => {
	test("submits non-empty draft, returns canonical value + empty next", () => {
		const draft: Draft = {
			left: [
				{ kind: "text", value: "read " },
				fileChip,
				{ kind: "text", value: " now" },
			],
			right: [],
		};
		const result = applyCommand(draft, { kind: "submit" });
		expect(result.kind).toBe("submitted");
		if (result.kind !== "submitted") throw new Error("unreachable");
		expect(result.value).toBe("read @[file:f1:readme.md] now");
		expect(result.nextDraft).toEqual({ left: [], right: [] });
	});

	test("blocks submit on empty draft", () => {
		const result = applyCommand(emptyDraft(), { kind: "submit" });
		expect(result.kind).toBe("submit-blocked-empty");
	});

	test("submits draft with text only in right (cursor at start)", () => {
		const draft: Draft = {
			left: [],
			right: [{ kind: "text", value: "hello" }],
		};
		const result = applyCommand(draft, { kind: "submit" });
		expect(result.kind).toBe("submitted");
		if (result.kind !== "submitted") throw new Error("unreachable");
		expect(result.value).toBe("hello");
	});
});

describe("parseDraft / serializeDraft round-trip", () => {
	test("plain text round-trips", () => {
		const d = parseDraft("hello world");
		expect(serializeDraft(d)).toBe("hello world");
	});

	test("text + chip + text round-trips", () => {
		const canonical = "read @[file:f1:readme.md] now";
		const d = parseDraft(canonical);
		expect(serializeDraft(d)).toBe(canonical);
	});

	test("multiple chips round-trip", () => {
		const canonical = "@[file:f1:a.txt] @[tab:t1:Tab] /skill:foo";
		const d = parseDraft(canonical);
		expect(serializeDraft(d)).toBe(canonical);
	});

	test("empty string parses to empty draft", () => {
		expect(parseDraft("")).toEqual({ left: [], right: [] });
	});

	test("parseDraft puts cursor at end (right is empty)", () => {
		const d = parseDraft("hello @[file:f1:x]");
		expect(d.right).toEqual([]);
		expect(d.left.length).toBeGreaterThan(0);
	});
});

describe("parseDraftAtOffset", () => {
	test("offset in plain text splits left/right correctly", () => {
		const d = parseDraftAtOffset("hello", 2);
		expect(serializeDraft({ left: d.left, right: [] })).toBe("he");
		expect(serializeDraft({ left: [], right: d.right })).toBe("llo");
	});

	test("offset at chip boundary: before chip", () => {
		const canonical = "ab@[file:f1:r.md]cd";
		const d = parseDraftAtOffset(canonical, 2);
		expect(serializeDraft({ left: d.left, right: [] })).toBe("ab");
		expect(serializeDraft({ left: [], right: d.right })).toBe(
			"@[file:f1:r.md]cd",
		);
	});

	test("offset at chip boundary: after chip", () => {
		const canonical = "ab@[file:f1:r.md]cd";
		const after = 2 + "@[file:f1:r.md]".length;
		const d = parseDraftAtOffset(canonical, after);
		expect(serializeDraft({ left: d.left, right: [] })).toBe(
			"ab@[file:f1:r.md]",
		);
		expect(serializeDraft({ left: [], right: d.right })).toBe("cd");
	});

	test("offset inside chip snaps to nearer edge (start)", () => {
		const canonical = "ab@[file:f1:r.md]cd";
		// offset 5 inside "@[file:f1:r.md]" (spans 2..18), nearer start
		const d = parseDraftAtOffset(canonical, 5);
		expect(serializeDraft({ left: d.left, right: [] })).toBe("ab");
	});

	test("offset inside chip snaps to nearer edge (end)", () => {
		const canonical = "ab@[file:f1:r.md]cd";
		// offset 17 inside chip (2..18), nearer end
		const d = parseDraftAtOffset(canonical, 17);
		expect(serializeDraft({ left: d.left, right: [] })).toBe(
			"ab@[file:f1:r.md]",
		);
	});

	test("offset past end clamps to end", () => {
		const d = parseDraftAtOffset("hello", 999);
		expect(d.right).toEqual([]);
	});
});

describe("applyCommand — exhaustive switch (assertNever)", () => {
	test("unknown variant throws", () => {
		// Bypass the type system to simulate a future unhandled variant.
		const bad = { kind: "future-command" } as unknown as Parameters<
			typeof applyCommand
		>[1];
		expect(() => applyCommand(emptyDraft(), bad)).toThrow(/Unreachable/);
	});
});

test("assertNever throws on any value", () => {
	expect(() => assertNever("x" as never)).toThrow();
});
