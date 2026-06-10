import { describe, expect, test, vi } from "vitest";
import {
	buildResolvedTask,
	parseSkillActivation,
	resolveTaskWithSkill,
	stripSkillToken,
} from "../../src/skills/resolve-skill-activations";
import type { SkillMeta } from "../../src/skills/skill-types";

const meta: SkillMeta = {
	name: "capability-check",
	description: "Probe",
	scope: "bundled",
	skillPath: "/skills/bundled/capability-check/SKILL.md",
	baseDir: "/skills/bundled/capability-check",
	disableModelInvocation: true,
	argumentNames: [],
};

describe("resolve-skill-activations", () => {
	test("parses /skill:name with args", () => {
		expect(parseSkillActivation("/skill:capability-check focus form")).toEqual({
			skillName: "capability-check",
			args: "focus form",
		});
	});

	test("escapes XML-significant attribute values", () => {
		const unsafeMeta = {
			...meta,
			name: "capability-check",
			skillPath: '/skills/bundled/cap"check/SKILL.md',
			baseDir: "/skills/bundled/cap<check>",
		};
		const resolved = buildResolvedTask(
			"/skill:capability-check",
			unsafeMeta,
			"Body line",
		);
		expect(resolved).toContain('location="/skills/bundled/cap&quot;check/SKILL.md"');
		expect(resolved).toContain(
			"References are relative to /skills/bundled/cap&lt;check&gt;.",
		);
	});

	test("builds XML block and strips token from remainder", () => {
		const resolved = buildResolvedTask(
			"/skill:capability-check focus",
			meta,
			"Body line",
		);
		expect(resolved).toContain('<skill name="capability-check"');
		expect(resolved).toContain("Body line");
		expect(stripSkillToken("/skill:capability-check focus")).toBe("");
	});

	test("preserves text before skill token", () => {
		const resolved = buildResolvedTask(
			"check page /skill:capability-check",
			meta,
			"Body",
		);
		expect(resolved).toContain("User task: check page");
	});
});

describe("resolveTaskWithSkill", () => {
	test("returns draft unchanged when no skill token", async () => {
		const loadBody = vi.fn();
		const result = await resolveTaskWithSkill("plain task", loadBody);
		expect(result).toEqual({
			task: "plain task",
			resolvedTask: "plain task",
		});
		expect(loadBody).not.toHaveBeenCalled();
	});

	test("loads skill body and builds XML block", async () => {
		const loadBody = vi.fn().mockResolvedValue({
			meta,
			body: "Probe steps",
		});
		const result = await resolveTaskWithSkill(
			"/skill:capability-check focus form",
			loadBody,
		);
		expect(loadBody).toHaveBeenCalledWith("capability-check");
		expect(result.task).toBe("/skill:capability-check focus form");
		expect(result.resolvedTask).toContain('<skill name="capability-check"');
		expect(result.resolvedTask).toContain("Probe steps");
	});

	test("rejects when loadBody throws", async () => {
		const loadBody = vi.fn().mockRejectedValue(new Error("Unknown skill: x"));
		await expect(
			resolveTaskWithSkill("/skill:missing-skill", loadBody),
		).rejects.toThrow("Unknown skill: x");
	});
});
