import type { SkillFsClient, SeedManifest } from "./skill-types";
import { SKILLS_SEED_VERSION_PATH } from "./skill-paths";

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

async function ensureParentDirs(fs: SkillFsClient, filePath: string): Promise<void> {
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

export async function seedBundledSkills(fs: SkillFsClient): Promise<void> {
	const manifest = await fetchSeedManifest();
	const currentVersion = await readSeedVersion(fs);
	if (currentVersion === manifest.version) {
		return;
	}

	for (const file of manifest.files) {
		const opfsPath = file.path.startsWith("/") ? file.path : `/${file.path}`;
		if (!opfsPath.startsWith("/skills/bundled/")) {
			continue;
		}
		const relative = opfsPath.slice("/skills/bundled/".length);
		const content = await fetchBundledAsset(relative);
		await ensureParentDirs(fs, opfsPath);
		await fs.fsWriteText(opfsPath, content);
	}

	await ensureParentDirs(fs, SKILLS_SEED_VERSION_PATH);
	await fs.fsWriteText(SKILLS_SEED_VERSION_PATH, manifest.version);
}
