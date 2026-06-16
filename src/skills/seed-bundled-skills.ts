import { sha256Hex } from "./sha256-hex";
import { SKILLS_BUNDLED_ROOT, SKILLS_SEED_VERSION_PATH } from "./skill-paths";
import type { SeedManifest, SkillFsClient } from "./skill-types";

async function fetchBundledAsset(relativePath: string): Promise<string> {
	const url = chrome.runtime.getURL(`skills/bundled/${relativePath}`);
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch bundled skill asset: ${relativePath}`);
	}
	return response.text();
}

async function fetchSeedManifest(): Promise<SeedManifest> {
	const url = chrome.runtime.getURL("skills/seed-manifest.json");
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error("Failed to fetch skills seed manifest");
	}
	const data: unknown = await response.json();
	if (
		typeof data !== "object" ||
		data === null ||
		typeof (data as SeedManifest).version !== "string" ||
		!Array.isArray((data as SeedManifest).files)
	) {
		throw new Error("Invalid skills seed manifest");
	}
	return data as SeedManifest;
}

async function readSeedVersion(fs: SkillFsClient): Promise<string | null> {
	try {
		const exists = await fs.fsExists(SKILLS_SEED_VERSION_PATH);
		if (!exists) return null;
		return await fs.fsReadText(SKILLS_SEED_VERSION_PATH);
	} catch {
		return null;
	}
}

async function ensureParentDirs(
	fs: SkillFsClient,
	filePath: string,
): Promise<void> {
	const parts = filePath.split("/").filter(Boolean);
	let current = "";
	for (let i = 0; i < parts.length - 1; i++) {
		current += `/${parts[i]}`;
		const exists = await fs.fsExists(current);
		if (!exists) {
			await fs.fsMkdir(current);
		}
	}
}

async function listAllFiles(
	fs: SkillFsClient,
	root: string,
): Promise<string[]> {
	const files: string[] = [];
	const rootExists = await fs.fsExists(root);
	if (!rootExists) return files;

	async function walk(dir: string): Promise<void> {
		const entries = await fs.fsList(dir);
		for (const entry of entries) {
			const child = `${dir}/${entry.name}`;
			if (entry.kind === "directory") {
				await walk(child);
			} else {
				files.push(child);
			}
		}
	}

	await walk(root);
	return files;
}

async function removeEmptyDirs(fs: SkillFsClient, root: string): Promise<void> {
	const rootExists = await fs.fsExists(root);
	if (!rootExists) return;

	const entries = await fs.fsList(root);
	for (const entry of entries) {
		if (entry.kind !== "directory") continue;
		const child = `${root}/${entry.name}`;
		await removeEmptyDirs(fs, child);
		const after = await fs.fsList(child);
		if (after.length === 0) {
			await fs.fsDelete(child);
		}
	}
}

async function removeOrphanedBundledFiles(
	fs: SkillFsClient,
	manifestPaths: ReadonlySet<string>,
): Promise<void> {
	const existing = await listAllFiles(fs, SKILLS_BUNDLED_ROOT);
	for (const path of existing) {
		if (!manifestPaths.has(path)) {
			await fs.fsDelete(path);
		}
	}
	await removeEmptyDirs(fs, SKILLS_BUNDLED_ROOT);
}

function normalizeBundledPath(rawPath: string): string | null {
	const opfsPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
	if (!opfsPath.startsWith("/skills/bundled/")) {
		return null;
	}
	return opfsPath;
}

async function validateBundledAssets(
	manifest: SeedManifest,
): Promise<Map<string, string>> {
	const validated = new Map<string, string>();

	for (const file of manifest.files) {
		const opfsPath = normalizeBundledPath(file.path);
		if (!opfsPath) continue;

		const relative = opfsPath.slice("/skills/bundled/".length);
		const content = await fetchBundledAsset(relative);
		const digest = await sha256Hex(content);
		if (digest !== file.sha256) {
			throw new Error(`Bundled skill digest mismatch: ${opfsPath}`);
		}
		validated.set(opfsPath, content);
	}

	return validated;
}

export async function seedBundledSkills(fs: SkillFsClient): Promise<void> {
	const manifest = await fetchSeedManifest();
	const currentVersion = await readSeedVersion(fs);
	if (currentVersion === manifest.version) {
		return;
	}

	const validated = await validateBundledAssets(manifest);
	const manifestPaths = new Set(validated.keys());

	await removeOrphanedBundledFiles(fs, manifestPaths);

	for (const [opfsPath, content] of validated) {
		await ensureParentDirs(fs, opfsPath);
		await fs.fsWriteText(opfsPath, content);
	}

	await ensureParentDirs(fs, SKILLS_SEED_VERSION_PATH);
	await fs.fsWriteText(SKILLS_SEED_VERSION_PATH, manifest.version);
}
