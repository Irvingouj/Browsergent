import { describe, expect, test, vi } from "vitest";
import {
	buildResolvedTask,
	MAX_SKILL_INJECT_CHARS,
	parseSkillActivation,
	resolveTaskWithSkill,
	stripSkillToken,
	truncateSkillBody,
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

	test("skill args stop before @[file: token", () => {
		const draft =
			"/skill:capability-check focus @[file:abc:notes.md] do thing";
		expect(parseSkillActivation(draft)).toEqual({
			skillName: "capability-check",
			args: "focus",
		});
		expect(stripSkillToken(draft)).toBe("@[file:abc:notes.md] do thing");
	});

	test("buildResolvedTask preserves file mention and user text after skill", () => {
		const draft =
			"/skill:capability-check @[file:abc:notes.md] do thing";
		expect(parseSkillActivation(draft)?.args).toBe("");
		const resolved = buildResolvedTask(draft, meta, "Body line");
		expect(resolved).toContain("User task: @[file:abc:notes.md] do thing");
	});

	test("preserves text before skill token", () => {
		const resolved = buildResolvedTask(
			"check page /skill:capability-check",
			meta,
			"Body",
		);
		expect(resolved).toContain("User task: check page");
	});

	test("truncates oversized skill body with [skill truncated]", () => {
		const oversizedBody = "x".repeat(50_000);
		const resolved = buildResolvedTask(
			"/skill:capability-check",
			meta,
			oversizedBody,
		);
		expect(resolved).toContain("[skill truncated]");
		// XML wrapper overhead for this meta = 156 chars (calculated from buildSkillXmlBlock)
		const XML_WRAPPER_OVERHEAD = 156;
		expect(resolved.length).toBe(
			XML_WRAPPER_OVERHEAD + MAX_SKILL_INJECT_CHARS,
		);
	});

	test("truncateSkillBody leaves short bodies unchanged", () => {
		expect(truncateSkillBody("short")).toBe("short");
	});

	test("does not truncate body at exactly MAX_SKILL_INJECT_CHARS", () => {
		const exactBody = "x".repeat(MAX_SKILL_INJECT_CHARS);
		expect(truncateSkillBody(exactBody)).toBe(exactBody);
	});

	test("truncates body at MAX_SKILL_INJECT_CHARS + 1", () => {
		const body = "x".repeat(MAX_SKILL_INJECT_CHARS + 1);
		const truncated = truncateSkillBody(body);
		expect(truncated.length).toBe(MAX_SKILL_INJECT_CHARS);
		expect(truncated).toContain("[skill truncated]");
	});

	test("truncateSkillBody handles empty string", () => {
		expect(truncateSkillBody("")).toBe("");
	});

	test("preserves head and tail of non-uniform body", () => {
		const marker = "\n\n[skill truncated]\n\n";
		const available = MAX_SKILL_INJECT_CHARS - marker.length;
		const head = Math.floor(available / 2);
		const tail = available - head;
		const body = "A".repeat(head) + "B".repeat(100) + "C".repeat(tail);
		const truncated = truncateSkillBody(body);
		expect(truncated.startsWith("A".repeat(head))).toBe(true);
		expect(truncated.endsWith("C".repeat(tail))).toBe(true);
		expect(truncated).toContain("[skill truncated]");
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
