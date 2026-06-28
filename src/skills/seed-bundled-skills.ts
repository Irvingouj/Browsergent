import { sha256Hex } from "./sha256-hex";
import { SKILLS_BUNDLED_ROOT, SKILLS_SEED_VERSION_PATH } from "./skill-paths";
import type { FsClient, SeedManifest } from "./skill-types";

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

async function readSeedVersion(fs: FsClient): Promise<string | null> {
	try {
		const { exists } = await fs.exists(SKILLS_SEED_VERSION_PATH);
		if (!exists) return null;
		const { data } = await fs.readText(SKILLS_SEED_VERSION_PATH);
		return data;
	} catch {
		return null;
	}
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

async function listAllFiles(
	fs: FsClient,
	root: string,
): Promise<string[]> {
	const files: string[] = [];
	const { exists: rootExists } = await fs.exists(root);
	if (!rootExists) return files;

	async function walk(dir: string): Promise<void> {
		const { entries } = await fs.list(dir);
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

async function removeEmptyDirs(fs: FsClient, root: string): Promise<void> {
	const { exists: rootExists } = await fs.exists(root);
	if (!rootExists) return;

	const { entries } = await fs.list(root);
	for (const entry of entries) {
		if (entry.kind !== "directory") continue;
		const child = `${root}/${entry.name}`;
		await removeEmptyDirs(fs, child);
		const { entries: after } = await fs.list(child);
		if (after.length === 0) {
			await fs.delete(child);
		}
	}
}

async function removeOrphanedBundledFiles(
	fs: FsClient,
	manifestPaths: ReadonlySet<string>,
): Promise<void> {
	const existing = await listAllFiles(fs, SKILLS_BUNDLED_ROOT);
	for (const path of existing) {
		if (!manifestPaths.has(path)) {
			await fs.delete(path);
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

export async function seedBundledSkills(fs: FsClient): Promise<void> {
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
		await fs.writeText(opfsPath, content);
	}

	await ensureParentDirs(fs, SKILLS_SEED_VERSION_PATH);
	await fs.writeText(SKILLS_SEED_VERSION_PATH, manifest.version);
}
