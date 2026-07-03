import type { AgentToolDefinition } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import type { FileOp, FileOpResult } from "../file-op-relay";
import { formatToolError } from "../tool-error-result";
import {
	FILE_DELETE_DESCRIPTION,
	FILE_EDIT_DESCRIPTION,
	FILE_LIST_DESCRIPTION,
	FILE_PATH_HELP,
	FILE_READ_DESCRIPTION,
	FILE_WRITE_DESCRIPTION,
	formatFileEditResult,
	formatFileListResult,
	formatFileOpError,
	validateFileToolPath,
} from "./file-helpers";

export function createFileTools(
	fileOp: (op: FileOp) => Promise<FileOpResult>,
): AgentToolDefinition[] {
	return [
		{
			name: "file_list",
			description: FILE_LIST_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					prefix: {
						type: "string",
						description:
							"Optional case-sensitive prefix filter (e.g. 'notes' matches 'notes.md').",
					},
				},
			},
			run: async (input: unknown) => {
				const parsed = z
					.object({ prefix: z.string().optional() })
					.safeParse(input);
				const prefix = parsed.success ? parsed.data.prefix : undefined;
				try {
					const result = await fileOp({ op: "list", prefix });
					if (result.op !== "list") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							"Unexpected result for file_list",
							"",
						);
					}
					return formatFileListResult(result.files);
				} catch (err) {
					return formatFileOpError(err);
				}
			},
		},
		{
			name: "file_read",
			description: FILE_READ_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							'File path (e.g. "/foo.md" or "sub/bar.md"; relative resolves against root "/").',
					},
				},
				required: ["path"],
			},
			run: async (input: unknown) => {
				const parsed = z.object({ path: z.string() }).safeParse(input);
				if (!parsed.success || !parsed.data.path.trim()) {
					return formatToolError(
						"E_FILE_INVALID",
						"file_read requires a non-empty 'path' string",
						FILE_PATH_HELP,
					);
				}
				const pathError = validateFileToolPath(parsed.data.path);
				if (pathError) {
					return formatToolError(
						"E_FILE_PATH_SCOPE",
						pathError,
						FILE_PATH_HELP,
					);
				}
				try {
					const result = await fileOp({ op: "read", path: parsed.data.path });
					if (result.op !== "read") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							"Unexpected result for file_read",
							"",
						);
					}
					return result.content;
				} catch (err) {
					return formatFileOpError(err);
				}
			},
		},
		{
			name: "file_edit",
			description: FILE_EDIT_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							'File path (e.g. "/foo.md" or "sub/bar.md"; relative resolves against root "/").',
					},
					old_string: {
						type: "string",
						description: "The exact text to replace.",
					},
					new_string: {
						type: "string",
						description: "The text to replace it with.",
					},
					replace_all: {
						type: "boolean",
						description:
							"If true, replace every occurrence. Defaults to false (requires uniqueness).",
					},
				},
				required: ["path", "old_string", "new_string"],
			},
			run: async (input: unknown) => {
				const parsed = z
					.object({
						path: z.string(),
						old_string: z.string(),
						new_string: z.string(),
						replace_all: z.boolean().optional(),
					})
					.safeParse(input);
				if (
					!parsed.success ||
					!parsed.data.path.trim() ||
					!parsed.data.old_string ||
					!parsed.data.new_string
				) {
					return formatToolError(
						"E_FILE_INVALID",
						"file_edit requires non-empty path, old_string, and new_string",
						FILE_PATH_HELP,
					);
				}
				const pathError = validateFileToolPath(parsed.data.path);
				if (pathError) {
					return formatToolError(
						"E_FILE_PATH_SCOPE",
						pathError,
						FILE_PATH_HELP,
					);
				}
				try {
					const result = await fileOp({
						op: "edit",
						path: parsed.data.path,
						oldString: parsed.data.old_string,
						newString: parsed.data.new_string,
						replaceAll: parsed.data.replace_all ?? false,
					});
					if (result.op !== "edit") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							"Unexpected result for file_edit",
							"",
						);
					}
					return formatFileEditResult(
						result.occurrences,
						result.bytes,
						parsed.data.path,
					);
				} catch (err) {
					return formatFileOpError(err);
				}
			},
		},
		{
			name: "file_delete",
			description: FILE_DELETE_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							'File path (e.g. "/foo.md" or "sub/bar.md"; relative resolves against root "/").',
					},
				},
				required: ["path"],
			},
			run: async (input: unknown) => {
				const parsed = z.object({ path: z.string() }).safeParse(input);
				if (!parsed.success || !parsed.data.path.trim()) {
					return formatToolError(
						"E_FILE_INVALID",
						"file_delete requires a non-empty 'path' string",
						FILE_PATH_HELP,
					);
				}
				const pathError = validateFileToolPath(parsed.data.path);
				if (pathError) {
					return formatToolError(
						"E_FILE_PATH_SCOPE",
						pathError,
						FILE_PATH_HELP,
					);
				}
				try {
					const result = await fileOp({ op: "delete", path: parsed.data.path });
					if (result.op !== "delete") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							"Unexpected result for file_delete",
							"",
						);
					}
					return `Deleted ${parsed.data.path}.`;
				} catch (err) {
					return formatFileOpError(err);
				}
			},
		},
		{
			name: "file_write",
			description: FILE_WRITE_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							'File path (e.g. "/foo.md" or "sub/bar.md"; relative resolves against root "/").',
					},
					content: {
						type: "string",
						description: "UTF-8 text content for the file.",
					},
				},
				required: ["path", "content"],
			},
			run: async (input: unknown) => {
				const parsed = z
					.object({ path: z.string(), content: z.string() })
					.safeParse(input);
				if (
					!parsed.success ||
					!parsed.data.path.trim() ||
					!parsed.data.content
				) {
					return formatToolError(
						"E_FILE_INVALID",
						"file_write requires non-empty 'path' and 'content' strings",
						FILE_PATH_HELP,
					);
				}
				const pathError = validateFileToolPath(parsed.data.path);
				if (pathError) {
					return formatToolError(
						"E_FILE_PATH_SCOPE",
						pathError,
						FILE_PATH_HELP,
					);
				}
				try {
					const result = await fileOp({
						op: "write",
						path: parsed.data.path,
						content: parsed.data.content,
					});
					if (result.op !== "write") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							"Unexpected result for file_write",
							"",
						);
					}
					return `Wrote ${parsed.data.path}: ${result.bytes} bytes.`;
				} catch (err) {
					return formatFileOpError(err);
				}
			},
		},
	];
}