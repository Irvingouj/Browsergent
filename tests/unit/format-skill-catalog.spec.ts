import { describe, expect, test } from "vitest";
import { formatSkillCatalog } from "../../src/skills/format-skill-catalog";
import type { SkillMeta } from "../../src/skills/skill-types";

const bundled: SkillMeta = {
	name: "capability-check",
	description: "Probe the page",
	scope: "bundled",
	skillPath: "/skills/bundled/capability-check/SKILL.md",
	baseDir: "/skills/bundled/capability-check",
	disableModelInvocation: false,
	argumentNames: [],
};

const hidden: SkillMeta = {
	...bundled,
	name: "hidden-skill",
	disableModelInvocation: true,
};

describe("format-skill-catalog", () => {
	test("includes visible skills only", () => {
		const catalog = formatSkillCatalog([bundled, hidden]);
		expect(catalog).toContain("capability-check");
		expect(catalog).not.toContain("hidden-skill");
	});

	test("respects char budget", () => {
		const many = Array.from({ length: 50 }, (_, i) => ({
			...bundled,
			name: `skill-${i}`,
			description: "x".repeat(300),
			scope: "user" as const,
		}));
		const catalog = formatSkillCatalog(many, { charBudget: 500 });
		expect(catalog.length).toBeLessThanOrEqual(520);
	});
});
