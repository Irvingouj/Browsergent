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

export interface FilesIndexEntry {
	id: string;
	name: string;
	size: number;
	mime: string;
	isText: boolean;
	path: string;
}

export interface FilesIndex {
	version: 1;
	entries: FilesIndexEntry[];
}

export function sanitizeFileName(name: string): string {
	return name.replace(/[\/\\\x00-\x1f\x7f]/g, "");
}

function sanitizeSessionId(sessionId: string): string {
	return sessionId.replace(/[\/\\\x00-\x1f\x7f]/g, "").replace(/\.\.+/g, "");
}

export function buildOpfsPath(
	sessionId: string,
	fileId: string,
	sanitizedName: string,
): string {
	const cleanSessionId = sanitizeSessionId(sessionId);
	return `/session-files/${cleanSessionId}/${fileId}-${sanitizedName}`;
}

export function isTextFile(name: string): boolean {
	const lower = name.toLowerCase();
	for (const ext of TEXT_EXTENSIONS) {
		if (lower.endsWith(ext)) return true;
	}
	return false;
}

export function buildFileNode(entry: FilesIndexEntry): FileNode {
	return {
		id: entry.id,
		name: entry.name,
		path: entry.path,
		kind: "file",
		size: entry.size,
		mime: entry.mime,
	};
}
