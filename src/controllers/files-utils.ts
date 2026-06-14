import type { FileNode } from "../state/slices/files-slice";

const TEXT_EXTENSIONS = new Set([
	".md",
	".txt",
	".json",
	".js",
	".ts",
	".jsx",
	".tsx",
	".css",
	".html",
	".xml",
	".yaml",
	".yml",
]);

export function sanitizeFileName(name: string): string {
	return name.replace(/[\/\\\x00-\x1f\x7f]/g, "");
}

export function isTextFile(name: string): boolean {
	const lower = name.toLowerCase();
	for (const ext of TEXT_EXTENSIONS) {
		if (lower.endsWith(ext)) return true;
	}
	return false;
}

export function findSkillManifest(files: File[]): File | null {
	for (const f of files) {
		if (f.name === "SKILL.md") return f;
		const wrp = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
		if (wrp?.endsWith("/SKILL.md")) return f;
	}
	return null;
}

interface FileNodeInput {
	name: string;
	path: string;
	parentId?: string;
	size?: number;
	mime?: string;
}

export function buildFileNode(input: FileNodeInput): FileNode {
	return {
		id: input.path,
		name: input.name,
		path: input.path,
		kind: "file",
		...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
		...(input.size !== undefined ? { size: input.size } : {}),
		...(input.mime !== undefined ? { mime: input.mime } : {}),
	};
}

interface DirectoryNodeInput {
	name: string;
	path: string;
	parentId?: string;
}

export function buildDirectoryNode(input: DirectoryNodeInput): FileNode {
	return {
		id: input.path,
		name: input.name,
		path: input.path,
		kind: "directory",
		...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
	};
}
