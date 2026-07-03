import { formatToolError } from "../tool-error-result";

export const FILE_LIST_DESCRIPTION = `List files in the shared OPFS filesystem (rooted at /).
Returns each file's path, name, size, mime, and isText flag. Use a prefix directory
path (e.g. "/user") to list only direct children of that directory. Binary files
(isText=false) cannot be read with file_read.`;

export const FILE_READ_DESCRIPTION = `Read text content from a file.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md"). Relative paths resolve against root "/".
- Use file_list to discover paths.
- Returns the text content in full.
- Binary files return E_FILE_BINARY.
Prefer this over run_js when you just want to read a file's content.`;

export const FILE_EDIT_DESCRIPTION = `Apply an exact text replacement to a file.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md"). Relative paths resolve against root "/".
- Use file_list to discover paths.
- \`old_string\` must match the file content exactly (indentation, whitespace, quotes).
- If \`old_string\` matches multiple locations, the call fails unless \`replace_all\` is true.`;

export const FILE_DELETE_DESCRIPTION = `Permanently remove a file from the shared OPFS filesystem.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md").
- Cannot be undone. Use only when the user asks to delete or when a file is no longer needed.`;

export const FILE_WRITE_DESCRIPTION = `Create or overwrite a text file at the given path.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md"). Relative paths resolve against root "/".
- \`content\` is the new file body (UTF-8 text).
- Auto-creates parent directories. Overwrites if the file exists.
- Prefer this over run_js+fs.writeText when you just need to write a file.`;

export const FILE_PATH_HELP =
	'Call file_list first to see available paths. Paths may be absolute ("/foo.md") or relative ("foo.md" resolves to "/foo.md").';

export function validateFileToolPath(path: string): string | null {
	const trimmed = path.trim();
	if (!trimmed) return "path must not be empty";
	if (trimmed.includes("..")) return "path must not contain '..'";
	if (trimmed.includes("\\")) return "path must not contain backslashes";
	if (trimmed.includes("\0")) return "path must not contain null bytes";
	return null;
}

export function formatFileOpError(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	if (msg.includes("not text")) {
		return formatToolError("E_FILE_BINARY", msg, FILE_PATH_HELP);
	}
	if (msg.includes("not found in file")) {
		return formatToolError(
			"E_FILE_STRING_NOT_FOUND",
			msg,
			"Use file_read to inspect the exact content; whitespace and quotes must match.",
		);
	}
	if (msg.includes("not found")) {
		return formatToolError("E_FILE_NOT_FOUND", msg, FILE_PATH_HELP);
	}
	if (msg.includes("out of scope") || msg.includes("out-of-scope")) {
		return formatToolError(
			"E_FILE_PATH_SCOPE",
			msg,
			"Only files in the current session are accessible.",
		);
	}
	if (msg.includes("matches")) {
		return formatToolError(
			"E_FILE_NOT_UNIQUE",
			msg,
			"Include more surrounding context in old_string, or set replace_all=true.",
		);
	}
	if (msg.includes("must differ") || msg.includes("must not be empty")) {
		return formatToolError("E_FILE_NO_CHANGE", msg, "");
	}
	if (msg.includes("max file size") || msg.includes("too large")) {
		return formatToolError("E_FILE_TOO_LARGE", msg, "");
	}
	return formatToolError("E_FILE_UNKNOWN", msg, FILE_PATH_HELP);
}

export function formatFileListResult(
	files: {
		id: string;
		name: string;
		path: string;
		size: number;
		mime: string;
		isText: boolean;
	}[],
): string {
	if (files.length === 0) return "No files in session.";
	const header = "path\tname\tsize\tmime\tisText";
	const rows = files.map(
		(f) =>
			`${f.path}\t${f.name}\t${f.size}\t${f.mime}\t${f.isText ? "yes" : "no"}`,
	);
	return [header, ...rows].join("\n");
}

export function formatFileEditResult(
	occurrences: number,
	bytes: number,
	name: string,
): string {
	return `Edited ${name}: replaced ${occurrences} occurrence${occurrences === 1 ? "" : "s"}; file is now ${bytes} bytes.`;
}
