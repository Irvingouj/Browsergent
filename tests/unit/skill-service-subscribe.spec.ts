import { describe, expect, test, vi } from "vitest";
import type { SkillMeta } from "../../src/skills/skill-types";

const sampleSkill: SkillMeta = {
	name: "demo",
	description: "Demo skill",
	scope: "bundled",
	skillPath: "/skills/bundled/demo/SKILL.md",
	baseDir: "/skills/bundled/demo",
	disableModelInvocation: false,
	argumentNames: [],
};

describe("SkillService.subscribeSkillsChanged", () => {
	test("notifies subscribers when skills change", async () => {
		const { SkillService } = await import("../../src/skills/skill-service");
		const service = new SkillService();
		const callback = vi.fn();
		const unsubscribe = service.subscribeSkillsChanged(callback);

		(
			service as unknown as { emitSkillsChanged(skills: SkillMeta[]): void }
		).emitSkillsChanged([sampleSkill]);

		expect(callback).toHaveBeenCalledWith([sampleSkill]);
		unsubscribe();
	});
});
