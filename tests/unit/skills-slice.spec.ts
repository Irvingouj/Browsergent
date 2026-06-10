import { describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("skills slice", () => {
	test("skillsDiagnosticsChanged stores diagnostics", () => {
		browsergentStore.getState().skillsDiagnosticsChanged([
			{
				kind: "validation",
				path: "/skills/user/bad/SKILL.md",
				message: "description is required",
			},
		]);

		expect(browsergentStore.getState().skills.diagnostics).toEqual([
			{
				kind: "validation",
				path: "/skills/user/bad/SKILL.md",
				message: "description is required",
			},
		]);
	});
});
