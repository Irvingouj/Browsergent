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
	test("includes visible skills only in XML catalog", () => {
		const catalog = formatSkillCatalog([bundled, hidden]);
		expect(catalog).toContain("<available_skills>");
		expect(catalog).toContain("<name>capability-check</name>");
		expect(catalog).not.toContain("hidden-skill");
		expect(catalog).toContain("</available_skills>");
	});

	test("escapes multiline and XML-significant descriptions", () => {
		const catalog = formatSkillCatalog([
			{
				...bundled,
				description: "Line one\n- fake entry\nUse <script>",
			},
		]);
		expect(catalog).toContain(
			"<description>Line one\n- fake entry\nUse &lt;script&gt;</description>",
		);
		expect(catalog.match(/<skill>/g)?.length).toBe(1);
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

	test("includes <match> element when skill has match field", () => {
		const catalog = formatSkillCatalog([
			{ ...bundled, match: "linkedin.com/jobs/*" },
		]);
		expect(catalog).toContain("<match>linkedin.com/jobs/*</match>");
	});

	test("omits <match> element when skill has no match field", () => {
		const catalog = formatSkillCatalog([bundled]);
		expect(catalog).not.toContain("<match>");
	});
});
