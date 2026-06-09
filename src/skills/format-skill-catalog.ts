import type { SkillMeta } from "./skill-types";

export const MAX_LISTING_DESC_CHARS = 250;
export const DEFAULT_CATALOG_CHAR_BUDGET = 8_000;

const MIN_DESC_LENGTH = 20;

const CATALOG_HEADER =
	"Available skills (use load_skill to load body; user may activate with /skill:name at compose time):";

function truncateDescription(text: string, maxChars: number): string {
	if (maxChars <= 0) return "";
	if (text.length <= maxChars) return text;
	if (maxChars <= 1) return "…";
	return `${text.slice(0, maxChars - 1)}…`;
}

function formatEntry(skill: SkillMeta, descBudget: number): string {
	const desc = truncateDescription(skill.description, descBudget);
	return `- ${skill.name}: ${desc}`;
}

function catalogLength(lines: string[]): number {
	if (lines.length === 0) return CATALOG_HEADER.length;
	return CATALOG_HEADER.length + 1 + lines.join("\n").length;
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

	let descBudget = MAX_LISTING_DESC_CHARS;
	let lines = [
		...bundled.map((s) => formatEntry(s, descBudget)),
		...rest.map((s) => formatEntry(s, descBudget)),
	];

	while (catalogLength(lines) > budget && descBudget > MIN_DESC_LENGTH) {
		descBudget = Math.max(MIN_DESC_LENGTH, Math.floor(descBudget * 0.7));
		lines = [
			...bundled.map((s) => formatEntry(s, descBudget)),
			...rest.map((s) => formatEntry(s, descBudget)),
		];
	}

	while (catalogLength(lines) > budget && lines.length > 1) {
		lines = lines.slice(0, -1);
	}

	if (catalogLength(lines) > budget && lines.length === 1) {
		const only = lines[0];
		if (only) {
			const overhead = CATALOG_HEADER.length + 3 + only.indexOf(":") + 1;
			const maxDesc = Math.max(0, budget - overhead);
			const skill = visible.find((s) => only.includes(s.name));
			if (skill) {
				lines = [formatEntry(skill, maxDesc)];
			}
		}
	}

	return `${CATALOG_HEADER}\n${lines.join("\n")}`;
}
