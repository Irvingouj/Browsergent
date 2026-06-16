export const SKILLS_BUNDLED_ROOT = "/skills/bundled";
export const SKILLS_USER_ROOT = "/skills/user";
export const SKILLS_SEED_VERSION_PATH = "/skills/.seed-version";

export function skillDir(scope: "bundled" | "user", name: string): string {
	const root = scope === "bundled" ? SKILLS_BUNDLED_ROOT : SKILLS_USER_ROOT;
	return `${root}/${name}`;
}

export function skillMdPath(scope: "bundled" | "user", name: string): string {
	return `${skillDir(scope, name)}/SKILL.md`;
}

export function isSafeSkillRelativePath(relativePath: string): boolean {
	if (!relativePath || relativePath.startsWith("/")) return false;
	const parts = relativePath.split(/[/\\]/);
	return !parts.some((part) => part === ".." || part === ".");
}

export function joinSkillResourcePath(
	baseDir: string,
	relativePath: string,
): string {
	if (!isSafeSkillRelativePath(relativePath)) {
		throw new Error(`Invalid skill resource path: ${relativePath}`);
	}
	return `${baseDir}/${relativePath}`;
}
