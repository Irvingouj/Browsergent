import { substituteArguments } from "./substitute-arguments";
import type { SkillMeta } from "./skill-types";
import { escapeXmlAttr } from "./validate-skill-meta";
import { truncateWithMarker } from "../utils/truncate";

const SKILL_HEAD_RE = /\/skill:([a-z0-9-]+)/;
const FILE_MENTION_TOKEN = "@[file:";

interface SkillTokenSegment {
	skillName: string;
	args: string;
	tokenStart: number;
	tokenEnd: number;
}

function parseSkillTokenSegment(draft: string): SkillTokenSegment | null {
	const headMatch = SKILL_HEAD_RE.exec(draft);
	if (!headMatch || headMatch.index === undefined) return null;

	const tokenStart = headMatch.index;
	const skillName = headMatch[1] ?? "";
	let tokenEnd = tokenStart + headMatch[0].length;
	let args = "";

	const rest = draft.slice(tokenEnd);
	if (rest.startsWith(" ")) {
		tokenEnd += 1;
		const afterSpace = draft.slice(tokenEnd);
		const fileIdx = afterSpace.indexOf(FILE_MENTION_TOKEN);
		if (fileIdx === -1) {
			args = afterSpace.trim();
			tokenEnd = draft.length;
		} else {
			args = afterSpace.slice(0, fileIdx).trimEnd();
			tokenEnd += fileIdx;
		}
	}

	return { skillName, args, tokenStart, tokenEnd };
}

export const MAX_SKILL_INJECT_CHARS = 32_000;

export function truncateSkillBody(body: string): string {
	return truncateWithMarker(body, MAX_SKILL_INJECT_CHARS, "\n\n[skill truncated]\n\n");
}

export interface SkillActivation {
	skillName: string;
	args: string;
}

export function parseSkillActivation(draft: string): SkillActivation | null {
	const parsed = parseSkillTokenSegment(draft);
	if (!parsed) return null;
	return {
		skillName: parsed.skillName,
		args: parsed.args,
	};
}

export function stripSkillToken(draft: string): string {
	const parsed = parseSkillTokenSegment(draft);
	if (!parsed) return draft.trim();
	const before = draft.slice(0, parsed.tokenStart);
	const after = draft.slice(parsed.tokenEnd);
	return `${before}${after}`.trim();
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
	const truncated = truncateSkillBody(substituted);
	const skillBlock = buildSkillXmlBlock(meta, truncated);
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
