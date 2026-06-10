import { parse as parseYaml } from "yaml";

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

export class SkillYamlParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SkillYamlParseError";
	}
}

function coerceFrontmatter(raw: unknown): SkillFrontmatter {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return {};
	}
	const obj = raw as Record<string, unknown>;
	const frontmatter: SkillFrontmatter = {};

	if (typeof obj.name === "string") {
		frontmatter.name = obj.name;
	}
	if (typeof obj.description === "string") {
		frontmatter.description = obj.description;
	}
	if (obj["disable-model-invocation"] === true) {
		frontmatter["disable-model-invocation"] = true;
	}
	if (typeof obj.arguments === "string" || Array.isArray(obj.arguments)) {
		frontmatter.arguments = obj.arguments as string | string[];
	}

	return frontmatter;
}

export function parseFrontmatter(raw: string): ParsedSkillMd {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: raw.trim() };
	}
	const yamlBlock = match[1] ?? "";
	const body = (match[2] ?? "").trim();

	if (!yamlBlock.trim()) {
		return { frontmatter: {}, body };
	}

	try {
		const parsed = parseYaml(yamlBlock);
		return { frontmatter: coerceFrontmatter(parsed), body };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new SkillYamlParseError(`Invalid SKILL.md frontmatter: ${message}`);
	}
}

export function parseArgumentNames(
	argumentNames: string | string[] | undefined,
): string[] {
	if (!argumentNames) return [];
	const isValidName = (name: string): boolean =>
		name.trim() !== "" && !/^\d+$/.test(name);
	if (Array.isArray(argumentNames)) {
		return argumentNames
			.filter((name): name is string => typeof name === "string")
			.filter(isValidName);
	}
	if (typeof argumentNames === "string") {
		return argumentNames.split(/\s+/).filter(isValidName);
	}
	return [];
}

export function stripFrontmatter(raw: string): string {
	return parseFrontmatter(raw).body;
}
