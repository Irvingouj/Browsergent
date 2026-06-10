import { substituteArguments } from "./substitute-arguments";
import type { SkillMeta } from "./skill-types";
import { escapeXmlAttr } from "./validate-skill-meta";

const SKILL_TOKEN_RE = /\/skill:([a-z0-9-]+)(?:\s+([\s\S]*))?/;

export interface SkillActivation {
	skillName: string;
	args: string;
}

export function parseSkillActivation(draft: string): SkillActivation | null {
	const match = draft.match(SKILL_TOKEN_RE);
	if (!match) return null;
	return {
		skillName: match[1] ?? "",
		args: (match[2] ?? "").trim(),
	};
}

export function stripSkillToken(draft: string): string {
	return draft.replace(SKILL_TOKEN_RE, "").trim();
}

export function buildSkillXmlBlock(
	meta: SkillMeta,
	body: string,
): string {
	return [
		`<skill name="${escapeXmlAttr(meta.name)}" location="${escapeXmlAttr(meta.skillPath)}">`,
		`References are relative to ${escapeXmlAttr(meta.baseDir)}.`,
		"",
		body,
		"</skill>",
	].join("\n");
}

export function buildResolvedTask(
	draft: string,
	meta: SkillMeta,
	rawBody: string,
	activation?: SkillActivation | null,
): string {
	const parsed = activation ?? parseSkillActivation(draft);
	const args = parsed?.args ?? "";
	const substituted = substituteArguments(
		rawBody,
		args || undefined,
		true,
		[...meta.argumentNames],
	);
	const skillBlock = buildSkillXmlBlock(meta, substituted);
	const remainder = stripSkillToken(draft);

	if (remainder) {
		return `${skillBlock}\n\nUser task: ${remainder}`;
	}
	return skillBlock;
}

export async function resolveTaskWithSkill(
	draft: string,
	loadBody: (name: string) => Promise<{ meta: SkillMeta; body: string }>,
): Promise<{ task: string; resolvedTask: string }> {
	const activation = parseSkillActivation(draft);
	if (!activation) {
		return { task: draft, resolvedTask: draft };
	}

	const doc = await loadBody(activation.skillName);
	const resolvedTask = buildResolvedTask(draft, doc.meta, doc.body, activation);
	return { task: draft, resolvedTask };
}
