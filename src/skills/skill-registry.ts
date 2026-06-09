import {
	parseArgumentNames,
	parseFrontmatter,
} from "./parse-skill-md";
import {
	joinSkillResourcePath,
	SKILLS_BUNDLED_ROOT,
	SKILLS_USER_ROOT,
	skillMdPath,
} from "./skill-paths";
import type {
	SkillDocument,
	SkillFsClient,
	SkillMeta,
	SkillScope,
} from "./skill-types";

async function loadSkillMetaFromDir(
	fs: SkillFsClient,
	scope: SkillScope,
	dirName: string,
): Promise<SkillMeta | null> {
	const skillPath = skillMdPath(scope, dirName);
	const exists = await fs.fsExists(skillPath);
	if (!exists) return null;

	const raw = await fs.fsReadText(skillPath);
	const { frontmatter } = parseFrontmatter(raw);
	const description = frontmatter.description?.trim();
	if (!description) return null;

	const name = frontmatter.name?.trim() || dirName;
	const baseDir = scope === "bundled"
		? `${SKILLS_BUNDLED_ROOT}/${dirName}`
		: `${SKILLS_USER_ROOT}/${dirName}`;

	return {
		name,
		description,
		scope,
		skillPath,
		baseDir,
		disableModelInvocation: frontmatter["disable-model-invocation"] === true,
		argumentNames: parseArgumentNames(frontmatter.arguments),
	};
}

async function listScopeSkills(
	fs: SkillFsClient,
	scope: SkillScope,
	root: string,
): Promise<SkillMeta[]> {
	const rootExists = await fs.fsExists(root);
	if (!rootExists) return [];

	const entries = await fs.fsList(root);
	const skills: SkillMeta[] = [];

	for (const entry of entries) {
		if (entry.kind !== "directory") continue;
		const meta = await loadSkillMetaFromDir(fs, scope, entry.name);
		if (meta) skills.push(meta);
	}

	return skills;
}

export class SkillRegistry {
	constructor(private readonly fs: SkillFsClient) {}

	async listSkills(): Promise<SkillMeta[]> {
		const bundled = await listScopeSkills(
			this.fs,
			"bundled",
			SKILLS_BUNDLED_ROOT,
		);
		const user = await listScopeSkills(this.fs, "user", SKILLS_USER_ROOT);

		const byName = new Map<string, SkillMeta>();
		for (const skill of bundled) {
			byName.set(skill.name, skill);
		}
		for (const skill of user) {
			byName.set(skill.name, skill);
		}
		return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	async getSkill(name: string): Promise<SkillMeta | null> {
		const skills = await this.listSkills();
		return skills.find((s) => s.name === name) ?? null;
	}

	async loadSkillBody(skillName: string): Promise<SkillDocument> {
		const meta = await this.getSkill(skillName);
		if (!meta) {
			throw new Error(`Unknown skill: ${skillName}`);
		}
		const raw = await this.fs.fsReadText(meta.skillPath);
		const { body } = parseFrontmatter(raw);
		return { meta, body };
	}

	async loadSkillResource(
		skillName: string,
		relativePath: string,
	): Promise<string> {
		const meta = await this.getSkill(skillName);
		if (!meta) {
			throw new Error(`Unknown skill: ${skillName}`);
		}
		const fullPath = joinSkillResourcePath(meta.baseDir, relativePath);
		const exists = await this.fs.fsExists(fullPath);
		if (!exists) {
			throw new Error(`Skill resource not found: ${relativePath}`);
		}
		return this.fs.fsReadText(fullPath);
	}
}
