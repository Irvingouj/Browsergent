import type { SkillMeta } from "./skill-types";
import { escapeXmlText } from "./validate-skill-meta";

export const MAX_LISTING_DESC_CHARS = 250;
export const DEFAULT_CATALOG_CHAR_BUDGET = 8_000;

const MIN_DESC_LENGTH = 20;

const CATALOG_OPEN = "<available_skills>";
const CATALOG_CLOSE = "</available_skills>";

function truncateDescription(text: string, maxChars: number): string {
	if (maxChars <= 0) return "";
	if (text.length <= maxChars) return text;
	if (maxChars <= 1) return "…";
	return `${text.slice(0, maxChars - 1)}…`;
}

function formatSkillEntry(skill: SkillMeta, descBudget: number): string {
	const desc = truncateDescription(skill.description, descBudget);
	return [
		"  <skill>",
		`    <name>${escapeXmlText(skill.name)}</name>`,
		`    <description>${escapeXmlText(desc)}</description>`,
		`    <location>${escapeXmlText(skill.skillPath)}</location>`,
		"  </skill>",
	].join("\n");
}

function catalogLength(entries: string[]): number {
	if (entries.length === 0) return 0;
	return (
		CATALOG_OPEN.length +
		1 +
		entries.join("\n").length +
		1 +
		CATALOG_CLOSE.length
	);
}

export function formatSkillCatalog(
	skills: ReadonlyArray<SkillMeta>,
	options?: { charBudget?: number },
): string {
	const visible = skills.filter((s) => !s.disableModelInvocation);
	if (visible.length === 0) return "";

	const budget = options?.charBudget ?? DEFAULT_CATALOG_CHAR_BUDGET;
	const bundled = visible.filter((s) => s.scope === "bundled");
	const rest = visible.filter((s) => s.scope !== "bundled");
	const ordered = [...bundled, ...rest];

	let descBudget = MAX_LISTING_DESC_CHARS;
	let entries = ordered.map((s) => formatSkillEntry(s, descBudget));

	while (catalogLength(entries) > budget && descBudget > MIN_DESC_LENGTH) {
		descBudget = Math.max(MIN_DESC_LENGTH, Math.floor(descBudget * 0.7));
		entries = ordered.map((s) => formatSkillEntry(s, descBudget));
	}

	while (catalogLength(entries) > budget && entries.length > 1) {
		entries = entries.slice(0, -1);
	}

	if (catalogLength(entries) > budget && entries.length === 1) {
		const skill = ordered[0];
		if (skill) {
			const overhead =
				formatSkillEntry({ ...skill, description: "X" }, 1).length - 1;
			const maxDesc = Math.max(0, budget - overhead);
			entries = [formatSkillEntry(skill, maxDesc)];
		}
	}

	return `${CATALOG_OPEN}\n${entries.join("\n")}\n${CATALOG_CLOSE}`;
}
