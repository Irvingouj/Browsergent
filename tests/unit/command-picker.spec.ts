import { describe, expect, test } from "vitest";
import {
	type CommandPickerItem,
	filterPickerItems,
} from "../../src/sidepanel/components/CommandPicker";

const items: CommandPickerItem[] = [
	{
		id: "capability-check",
		label: "skill:capability-check",
		description: "Probe browser capabilities",
		insertText: "/skill:capability-check ",
	},
	{
		id: "fill-and-submit",
		label: "skill:fill-and-submit",
		description: "Fill and submit a form",
		insertText: "/skill:fill-and-submit ",
	},
	{
		id: "create-skill",
		label: "skill:create-skill",
		description: "Create a user skill",
		insertText: "/skill:create-skill ",
	},
];

describe("filterPickerItems", () => {
	test("returns all items when query is empty", () => {
		expect(filterPickerItems(items, "")).toHaveLength(3);
		expect(filterPickerItems(items, "   ")).toHaveLength(3);
	});

	test("filters by fzf subsequence in label", () => {
		expect(filterPickerItems(items, "cap")).toEqual([items[0]]);
	});

	test("filters by fzf subsequence in description", () => {
		expect(filterPickerItems(items, "probe")).toEqual([items[0]]);
	});

	test("matches non-contiguous subsequence", () => {
		expect(filterPickerItems(items, "fas")[0]?.id).toBe("fill-and-submit");
	});

	test("returns empty array when nothing matches", () => {
		expect(filterPickerItems(items, "zzz")).toEqual([]);
	});
});
