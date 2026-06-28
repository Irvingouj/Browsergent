import {
	findSkillManifest,
	isTextFile,
	sanitizeFileName,
} from "../controllers/files";
import { parseFrontmatter } from "./parse-skill-md";
import { SkillImportError } from "./skill-errors";
import { SKILLS_USER_ROOT } from "./skill-paths";
import type { FsClient } from "./skill-types";
import {
	validateSkillDescription,
	validateSkillName,
} from "./validate-skill-meta";

export interface SkillImportResult {
	name: string;
	fileCount: number;
	warnings: string[];
}

async function ensureParentDirs(
	fs: FsClient,
	filePath: string,
): Promise<void> {
	const parts = filePath.split("/").filter(Boolean);
	let current = "";
	for (let i = 0; i < parts.length - 1; i++) {
		current += `/${parts[i]}`;
		const { exists } = await fs.exists(current);
		if (!exists) {
			await fs.mkdir(current);
		}
	}
}

function computeRelativePath(file: File, _skillMd: File): string | null {
	const typed = file as File & { webkitRelativePath?: string };
	const wrp = typed.webkitRelativePath;
	if (wrp && wrp.length > 0) {
		const slashIdx = wrp.indexOf("/");
		if (slashIdx === -1) return wrp;
		const rel = wrp.slice(slashIdx + 1);
		if (rel.startsWith("/") || rel.includes("..")) return null;
		return rel;
	}
	const name = file.name;
	if (name.startsWith("/") || name.includes("..") || name.includes("\\"))
		return null;
	return name;
}

export class SkillImportController {
	constructor(private readonly fs: FsClient) {}

	async importSkill(files: File[]): Promise<SkillImportResult> {
		const skillMd = findSkillManifest(files);
		if (!skillMd) {
			throw new SkillImportError(
				"E_SKILL_NO_MANIFEST",
				"No SKILL.md found in upload",
			);
		}

		const raw = await skillMd.text();
		const parsed = parseFrontmatter(raw);

		const nameErrors = validateSkillName(parsed.frontmatter.name?.trim() || "");
		const descErrors = validateSkillDescription(parsed.frontmatter.description);
		const metaErrors = [...nameErrors, ...descErrors];
		if (metaErrors.length > 0) {
			throw new SkillImportError(
				"E_SKILL_INVALID_META",
				`Invalid SKILL.md: ${metaErrors.join("; ")}`,
			);
		}

		const skillName = sanitizeFileName(parsed.frontmatter.name ?? "");
		if (!skillName) {
			throw new SkillImportError(
				"E_SKILL_NAME_EMPTY",
				"Skill name is empty after sanitization",
			);
		}

		const warnings: string[] = [];
		const uniqueFiles = new Map<string, File>();
		for (const file of files) {
			const relPath = computeRelativePath(file, skillMd);
			if (!relPath) {
				warnings.push(`skipped file with unsafe path: ${file.name}`);
				continue;
			}
			if (!isTextFile(relPath)) {
				warnings.push(`skipped binary file: ${relPath}`);
				continue;
			}
			uniqueFiles.set(relPath, file);
		}

		for (const [relPath, file] of uniqueFiles) {
			const destPath = `${SKILLS_USER_ROOT}/${skillName}/${relPath}`;
			await ensureParentDirs(this.fs, destPath);
			const content = await file.text();
			await this.fs.writeText(destPath, content);
		}

		return { name: skillName, fileCount: uniqueFiles.size, warnings };
	}

	async deleteSkill(name: string): Promise<void> {
		const cleanName = sanitizeFileName(name);
		if (!cleanName)
			throw new SkillImportError("E_SKILL_NAME_EMPTY", "Invalid skill name");
		const skillDir = `${SKILLS_USER_ROOT}/${cleanName}`;
		await this.deleteDirContents(skillDir);
	}

	private async deleteDirContents(dirPath: string): Promise<void> {
		const { entries } = await this.fs.list(dirPath);
		for (const entry of entries) {
			const childPath = `${dirPath}/${entry.name}`;
			if (entry.kind === "directory") {
				await this.deleteDirContents(childPath);
			} else {
				await this.fs.delete(childPath);
			}
		}
	}
}
