import type { FileNode } from "../../state/slices/files-slice";

const BINARY_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".ico",
	".bmp",
	".pdf",
	".zip",
	".gz",
	".tar",
	".tgz",
	".rar",
	".7z",
	".exe",
	".dll",
	".so",
	".dylib",
	".class",
	".jar",
	".war",
	".wav",
	".mp3",
	".mp4",
	".avi",
	".mov",
	".webm",
	".ogg",
	".flac",
	".woff",
	".woff2",
	".ttf",
	".otf",
	".eot",
	".sqlite",
	".db",
	".pak",
	// Office formats (ZIP containers that decode as garbled text, not real text).
	".doc",
	".docx",
	".xls",
	".xlsx",
	".ppt",
	".pptx",
	// Modern image formats.
	".heic",
	".avif",
	// Other common binary formats.
	".wasm",
	".bz2",
	".xz",
	".zst",
	".iso",
	".dmg",
	".apk",
	".msi",
	".svgz",
	".psd",
	".o",
]);

export function sanitizeFileName(name: string): string {
	let out = "";
	for (const ch of name) {
		const code = ch.codePointAt(0);
		if (code === undefined) continue;
		if (ch === "/" || ch === "\\" || code <= 0x1f || code === 0x7f) continue;
		out += ch;
	}
	return out;
}

export function isTextFile(name: string): boolean {
	const lower = name.toLowerCase();
	for (const ext of BINARY_EXTENSIONS) {
		if (lower.endsWith(ext)) return false;
	}
	return true;
}

/** Read a File as pure base64. Environment-agnostic (browser + node test env). */
export async function fileToBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const CHUNK = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

export function findSkillManifest(files: File[]): File | null {
	for (const f of files) {
		if (f.name === "SKILL.md") return f;
		const wrp = (f as File & { webkitRelativePath?: string })
			.webkitRelativePath;
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
