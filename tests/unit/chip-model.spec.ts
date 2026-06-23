import { describe, expect, test } from "vitest";
import {
	nodePositionToOffset,
	offsetToNodePosition,
	parseBlocks,
	type ReconstructNode,
	reconstructCanonical,
} from "../../src/sidepanel/components/input/chip-model";

describe("parseBlocks", () => {
	test("plain text → single text block", () => {
		expect(parseBlocks("hello world")).toEqual([
			{ type: "text", text: "hello world" },
		]);
	});

	test("file token → mention block with basename label and full title", () => {
		const blocks = parseBlocks("see @[file:f1:src/App.tsx] now");
		expect(blocks).toHaveLength(3);
		expect(blocks[1]).toEqual({
			type: "mention",
			kind: "file",
			raw: "@[file:f1:src/App.tsx]",
			label: "App.tsx",
			title: "src/App.tsx",
		});
	});

	test("tab token → mention block with truncated label", () => {
		const longTitle = "A Very Long Tab Title That Exceeds Twenty Characters";
		const blocks = parseBlocks(`@[tab:42:${longTitle}]`);
		expect(blocks[0]).toEqual({
			type: "mention",
			kind: "tab",
			raw: `@[tab:42:${longTitle}]`,
			label: "A Very Long Tab Titl…",
			title: longTitle,
		});
	});

	test("skill token → mention block with slash label", () => {
		const blocks = parseBlocks("/skill:capability-check go");
		expect(blocks[0]).toEqual({
			type: "mention",
			kind: "skill",
			raw: "/skill:capability-check",
			label: "/capability-check",
			title: null,
		});
	});

	test("multiple tokens of mixed kinds", () => {
		const text = "/skill:foo @[file:a:b.txt] then @[tab:1:Hi]";
		expect(parseBlocks(text)).toHaveLength(5);
	});

	test("empty string → empty block list", () => {
		expect(parseBlocks("")).toEqual([]);
	});
});

describe("reconstructCanonical", () => {
	test("text + chip + text round-trips to canonical string", () => {
		const nodes: ReconstructNode[] = [
			{ text: "see ", raw: null },
			{ text: null, raw: "@[file:f1:src/App.tsx]" },
			{ text: " now", raw: null },
		];
		expect(reconstructCanonical(nodes)).toBe("see @[file:f1:src/App.tsx] now");
	});

	test("empty nodes → empty string", () => {
		expect(reconstructCanonical([])).toBe("");
	});

	test("chip-only round-trips", () => {
		const nodes: ReconstructNode[] = [{ text: null, raw: "/skill:foo" }];
		expect(reconstructCanonical(nodes)).toBe("/skill:foo");
	});

	test("preserves newlines from text nodes", () => {
		const nodes: ReconstructNode[] = [{ text: "line1\nline2", raw: null }];
		expect(reconstructCanonical(nodes)).toBe("line1\nline2");
	});
});

describe("offsetToNodePosition / nodePositionToOffset round-trip", () => {
	// "ab " (len 3) | "@[file:f1:c.txt]" (len 16) | " de" (len 3)
	// offsets:  0..2 text | 3..18 chip | 19..21 text
	const nodes: ReconstructNode[] = [
		{ text: "ab ", raw: null },
		{ text: null, raw: "@[file:f1:c.txt]" },
		{ text: " de", raw: null },
	];

	test("offset inside leading text node maps to a text position", () => {
		const pos = offsetToNodePosition(nodes, 2);
		expect(pos).toEqual({ nodeIndex: 0, offsetInNode: 2 });
		expect(nodePositionToOffset(nodes, pos!.nodeIndex, pos!.offsetInNode)).toBe(
			2,
		);
	});

	test("offset at chip boundary is end of preceding text node", () => {
		// offset 3 = start of chip = end of "ab "
		const pos = offsetToNodePosition(nodes, 3);
		expect(pos).toEqual({ nodeIndex: 0, offsetInNode: 3 });
		expect(nodePositionToOffset(nodes, pos!.nodeIndex, pos!.offsetInNode)).toBe(
			3,
		);
	});

	test("offset inside chip snaps to nearest edge of chip node", () => {
		// chip spans 3..19; offset 7 is nearer start → chip edge 0
		const pos = offsetToNodePosition(nodes, 7);
		expect(pos).toEqual({ nodeIndex: 1, offsetInNode: 0 });
		// round-trips back to chip start
		expect(nodePositionToOffset(nodes, 1, 0)).toBe(3);
	});

	test("offset inside trailing text node maps correctly", () => {
		// offset 20 = " de" char 1
		const pos = offsetToNodePosition(nodes, 20);
		expect(pos).toEqual({ nodeIndex: 2, offsetInNode: 1 });
		expect(nodePositionToOffset(nodes, pos!.nodeIndex, pos!.offsetInNode)).toBe(
			20,
		);
	});

	test("offset past end clamps to end of last node", () => {
		const pos = offsetToNodePosition(nodes, 999);
		expect(pos).toEqual({ nodeIndex: 2, offsetInNode: 3 });
	});

	test("empty node list returns null", () => {
		expect(offsetToNodePosition([], 0)).toBeNull();
	});
});

describe("nodePositionToOffset edge cases", () => {
	test("clamps negative offsetInNode to 0", () => {
		const nodes: ReconstructNode[] = [{ text: "abc", raw: null }];
		expect(nodePositionToOffset(nodes, 0, -5)).toBe(0);
	});

	test("clamps offsetInNode beyond node length", () => {
		const nodes: ReconstructNode[] = [{ text: "abc", raw: null }];
		expect(nodePositionToOffset(nodes, 0, 99)).toBe(3);
	});

	test("nodeIndex beyond list returns total length", () => {
		const nodes: ReconstructNode[] = [
			{ text: "ab", raw: null },
			{ text: null, raw: "@[file:x:y]" }, // len 11
		];
		expect(nodePositionToOffset(nodes, 5, 0)).toBe(13);
	});
});
