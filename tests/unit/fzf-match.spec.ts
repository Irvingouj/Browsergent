import { describe, expect, test } from "vitest";
import { rankFzfItems, scoreFzfMatch } from "../../src/sidepanel/fzf-match";

const items = [
	{
		id: "capability-check",
		label: "skill:capability-check",
		description: "Probe browser capabilities",
	},
	{
		id: "fill-and-submit",
		label: "skill:fill-and-submit",
		description: "Fill and submit a form",
	},
];

describe("scoreFzfMatch", () => {
	test("empty query matches everything", () => {
		expect(scoreFzfMatch("", items[0].label, items[0].description)).toBe(0);
	});

	test("matches subsequence in label", () => {
		expect(scoreFzfMatch("cap", items[0].label, items[0].description)).not.toBeNull();
	});

	test("matches subsequence in description", () => {
		expect(scoreFzfMatch("probe", items[0].label, items[0].description)).not.toBeNull();
	});

	test("rejects non-subsequence query", () => {
		expect(scoreFzfMatch("zzz", items[0].label, items[0].description)).toBeNull();
	});
});

describe("rankFzfItems", () => {
	test("returns all items for empty query", () => {
		expect(rankFzfItems(items, "")).toHaveLength(2);
	});

	test("ranks capability-check for cap", () => {
		expect(rankFzfItems(items, "cap")[0]?.id).toBe("capability-check");
	});

	test("ranks fill-and-submit for fas", () => {
		expect(rankFzfItems(items, "fas")[0]?.id).toBe("fill-and-submit");
	});
});
