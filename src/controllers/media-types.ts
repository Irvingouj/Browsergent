import { isTextFile } from "./files";

export type MediaKind = "image" | "video" | "pdf" | "audio" | "text" | "binary";

const EXT_TO_MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".svg": "image/svg+xml",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mov": "video/quicktime",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
	".ogv": "video/ogg",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".flac": "audio/flac",
	".m4a": "audio/mp4",
	".aac": "audio/aac",
	".pdf": "application/pdf",
};

/** Resolve a MIME for a data: URL. Prefer node.mime; fall back to extension map. */
export function resolveMime(name: string, mime?: string): string | undefined {
	if (mime && mime.length > 0) return mime;
	const lower = name.toLowerCase();
	for (const [ext, type] of Object.entries(EXT_TO_MIME)) {
		if (lower.endsWith(ext)) return type;
	}
	return undefined;
}

/** Coarse kind for routing to a renderer. "binary" = unsupported fallback. */
export function classifyMedia(name: string, mime?: string): MediaKind {
	const resolved = resolveMime(name, mime);
	if (resolved !== undefined) {
		if (resolved.startsWith("image/")) return "image";
		if (resolved.startsWith("video/")) return "video";
		if (resolved.startsWith("audio/")) return "audio";
		if (resolved === "application/pdf") return "pdf";
	}
	if (isTextFile(name)) return "text";
	return "binary";
}

/** Per-type default preview panel height in pixels. */
export function defaultPreviewHeightPx(kind: MediaKind): number {
	switch (kind) {
		case "pdf":
			return 520;
		case "image":
			return 420;
		case "video":
			return 420;
		case "audio":
			return 120;
		case "text":
			return 240;
		case "binary":
			return 80;
		default:
			return 240;
	}
}
