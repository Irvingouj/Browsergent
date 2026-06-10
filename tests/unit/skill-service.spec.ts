import { describe, expect, test } from "vitest";
import {
	assertSkillLoadAllowed,
	SkillInvocationError,
} from "../../src/skills/skill-errors";

describe("assertSkillLoadAllowed", () => {
	test("tool path rejects disable-model-invocation without activation", () => {
		expect(() =>
			assertSkillLoadAllowed("capability-check", true, { source: "tool" }),
		).toThrow(SkillInvocationError);
	});

	test("tool path allows when skill was activated", () => {
		expect(() =>
			assertSkillLoadAllowed("capability-check", true, {
				source: "tool",
				activatedSkills: ["capability-check"],
			}),
		).not.toThrow();
	});

	test("compose path always allows", () => {
		expect(() =>
			assertSkillLoadAllowed("capability-check", true, { source: "compose" }),
		).not.toThrow();
	});
});
