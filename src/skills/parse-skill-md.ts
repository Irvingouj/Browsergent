export interface SkillFrontmatter {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
	arguments?: string | string[];
}

export interface ParsedSkillMd {
	frontmatter: SkillFrontmatter;
	body: string;
}

export function parseFrontmatter(raw: string): ParsedSkillMd {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: raw.trim() };
	}
	const yamlBlock = match[1] ?? "";
	const body = (match[2] ?? "").trim();
	const frontmatter: SkillFrontmatter = {};

	for (const line of yamlBlock.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colon = trimmed.indexOf(":");
		if (colon === -1) continue;
		const key = trimmed.slice(0, colon).trim();
		let value = trimmed.slice(colon + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (key === "disable-model-invocation") {
			frontmatter[key] = value === "true";
		} else if (key === "arguments") {
			frontmatter.arguments = value;
		} else if (key === "name") {
			frontmatter.name = value;
		} else if (key === "description") {
			frontmatter.description = value;
		}
	}

	return { frontmatter, body };
}

export function parseArgumentNames(
	argumentNames: string | string[] | undefined,
): string[] {
	if (!argumentNames) return [];
	const isValidName = (name: string): boolean =>
		name.trim() !== "" && !/^\d+$/.test(name);
	if (Array.isArray(argumentNames)) {
		return argumentNames.filter(isValidName);
	}
	if (typeof argumentNames === "string") {
		return argumentNames.split(/\s+/).filter(isValidName);
	}
	return [];
}

export function stripFrontmatter(raw: string): string {
	return parseFrontmatter(raw).body;
}
