import type { AgentToolDefinition } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import { formatToolError } from "../tool-error-result";

export function createLoadSkillTool(
	loadSkill: (skill: string, path?: string) => Promise<string>,
): AgentToolDefinition {
	return {
		name: "load_skill",
		description:
			"Load a Browsergent skill body or resource file. Use when following a skill from the catalog or when a skill references files under references/.",
		inputSchema: {
			type: "object",
			properties: {
				skill: {
					type: "string",
					description: "Skill name, e.g. capability-check",
				},
				path: {
					type: "string",
					description:
						"Optional relative path under the skill directory, e.g. references/checklist.md",
				},
			},
			required: ["skill"],
		},
		run: async (input: unknown) => {
			const parsed = z
				.object({
					skill: z.string(),
					path: z.string().optional(),
				})
				.safeParse(input);
			if (!parsed.success || !parsed.data.skill.trim()) {
				return formatToolError(
					"E_SKILL_INVALID",
					"load_skill requires a non-empty skill name",
					'Call load_skill with { skill: "skill-name" } from the catalog.',
				);
			}
			const { skill, path: resourcePath } = parsed.data;
			if (resourcePath?.includes("..")) {
				return formatToolError(
					"E_SKILL_PATH_FORBIDDEN",
					"Skill resource path must not contain ..",
					"Use a path relative to the skill directory without .. segments.",
				);
			}
			try {
				const content = await loadSkill(skill, resourcePath);
				return content;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes("disable-model-invocation")) {
					return formatToolError(
						"E_SKILL_INVOCATION_FORBIDDEN",
						msg,
						"Ask the user to activate this skill with /skill:name at compose time.",
					);
				}
				return formatToolError(
					"E_SKILL_NOT_FOUND",
					msg,
					"Check skill names in the catalog or ask the user to activate with /skill:name.",
				);
			}
		},
	};
}