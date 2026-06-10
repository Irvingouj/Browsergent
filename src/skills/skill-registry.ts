import {
	parseArgumentNames,
	parseFrontmatter,
	SkillYamlParseError,
} from "./parse-skill-md";
import {
	joinSkillResourcePath,
	SKILLS_BUNDLED_ROOT,
	SKILLS_USER_ROOT,
	skillMdPath,
} from "./skill-paths";
import type {
	SkillDiagnostic,
	SkillDocument,
	SkillFsClient,
	SkillListResult,
	SkillMeta,
	SkillScope,
} from "./skill-types";
import {
	validateSkillDescription,
	validateSkillName,
} from "./validate-skill-meta";

interface LoadMetaResult {
	meta: SkillMeta | null;
	diagnostics: SkillDiagnostic[];
}

async function loadSkillMetaFromDir(
	fs: SkillFsClient,
	scope: SkillScope,
	dirName: string,
): Promise<LoadMetaResult> {
	const skillPath = skillMdPath(scope, dirName);
	const diagnostics: SkillDiagnostic[] = [];
	const exists = await fs.fsExists(skillPath);
	if (!exists) return { meta: null, diagnostics };

	let raw: string;
	try {
		raw = await fs.fsReadText(skillPath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		diagnostics.push({
			kind: "validation",
			path: skillPath,
			message: `failed to read skill: ${message}`,
		});
		return { meta: null, diagnostics };
	}

	let frontmatter;
	try {
		({ frontmatter } = parseFrontmatter(raw));
	} catch (err) {
		const message =
			err instanceof SkillYamlParseError
				? err.message
				: err instanceof Error
					? err.message
					: String(err);
		diagnostics.push({ kind: "validation", path: skillPath, message });
		return { meta: null, diagnostics };
	}

	const name = frontmatter.name?.trim() || dirName;
	if (frontmatter.name?.trim() && frontmatter.name.trim() !== dirName) {
		diagnostics.push({
			kind: "validation",
			path: skillPath,
			message: `name "${frontmatter.name.trim()}" does not match directory "${dirName}"`,
		});
	}

	const nameErrors = validateSkillName(name);
	for (const message of nameErrors) {
		diagnostics.push({ kind: "validation", path: skillPath, message });
	}

	const description = frontmatter.description?.trim();
	const descriptionErrors = validateSkillDescription(description);
	for (const message of descriptionErrors) {
		diagnostics.push({ kind: "validation", path: skillPath, message });
	}

	if (nameErrors.length > 0 || descriptionErrors.length > 0) {
		return { meta: null, diagnostics };
	}

	const baseDir =
		scope === "bundled"
			? `${SKILLS_BUNDLED_ROOT}/${dirName}`
			: `${SKILLS_USER_ROOT}/${dirName}`;

	const validDescription = description as string;

	return {
		meta: {
			name,
			description: validDescription,
			scope,
			skillPath,
			baseDir,
			disableModelInvocation: frontmatter["disable-model-invocation"] === true,
			argumentNames: parseArgumentNames(frontmatter.arguments),
		},
		diagnostics,
	};
}

async function listScopeSkills(
	fs: SkillFsClient,
	scope: SkillScope,
	root: string,
): Promise<{ skills: SkillMeta[]; diagnostics: SkillDiagnostic[] }> {
	const rootExists = await fs.fsExists(root);
	if (!rootExists) return { skills: [], diagnostics: [] };

	const entries = await fs.fsList(root);
	const skills: SkillMeta[] = [];
	const diagnostics: SkillDiagnostic[] = [];

	for (const entry of entries) {
		if (entry.kind !== "directory") continue;
		const result = await loadSkillMetaFromDir(fs, scope, entry.name);
		diagnostics.push(...result.diagnostics);
		if (result.meta) skills.push(result.meta);
	}

	return { skills, diagnostics };
}

export class SkillRegistry {
	constructor(private readonly fs: SkillFsClient) {}

	async listSkills(): Promise<SkillListResult> {
		const bundled = await listScopeSkills(
			this.fs,
			"bundled",
			SKILLS_BUNDLED_ROOT,
		);
		const user = await listScopeSkills(this.fs, "user", SKILLS_USER_ROOT);

		const byName = new Map<string, SkillMeta>();
		const diagnostics: SkillDiagnostic[] = [
			...bundled.diagnostics,
			...user.diagnostics,
		];

		for (const skill of bundled.skills) {
			const existing = byName.get(skill.name);
			if (existing) {
				diagnostics.push({
					kind: "collision",
					name: skill.name,
					winnerPath: existing.skillPath,
					loserPath: skill.skillPath,
					winnerScope: existing.scope,
				});
			} else {
				byName.set(skill.name, skill);
			}
		}

		for (const skill of user.skills) {
			const existing = byName.get(skill.name);
			if (existing) {
				diagnostics.push({
					kind: "collision",
					name: skill.name,
					winnerPath: skill.skillPath,
					loserPath: existing.skillPath,
					winnerScope: skill.scope,
				});
			}
			byName.set(skill.name, skill);
		}

		const skills = [...byName.values()].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return { skills, diagnostics };
	}

	async getSkill(name: string): Promise<SkillMeta | null> {
		const { skills } = await this.listSkills();
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
