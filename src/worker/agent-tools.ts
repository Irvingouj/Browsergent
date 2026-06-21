import type { AgentToolDefinition, AgentTools } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import type { CellResult } from "../types/extjs-utils";
import { formatJsRunResult } from "../types/extjs-utils";
import type { FileOp, FileOpResult } from "./file-op-relay";
import { JS_TOOL_PROMPT } from "./js-tool-prompt";
import { formatToolError, isStackUseful } from "./tool-error-result";
import { getCurrentTraceId } from "./current-trace";

interface ExtensionJsApiEntry {
	namespace: string;
	name: string;
	action: string | null;
	description: string;
	params: ReadonlyArray<{
		name: string;
		js_type: string;
		required: boolean;
		description: string;
	}>;
	returns: {
		js_type: string;
		description: string;
	};
}

function isApiEntry(value: unknown): value is ExtensionJsApiEntry {
	if (typeof value !== "object" || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.namespace === "string" &&
		typeof entry.name === "string" &&
		(entry.action === null || typeof entry.action === "string") &&
		typeof entry.description === "string" &&
		Array.isArray(entry.params) &&
		typeof entry.returns === "object" &&
		entry.returns !== null
	);
}

function renderMarkdownDocs(entries: ExtensionJsApiEntry[]): string {
	if (entries.length === 0) return "No API documentation matched that filter.";
	return entries
		.map((entry) => {
			const params =
				entry.params.length === 0
					? "- none"
					: entry.params
							.map((param) => {
								const required = param.required ? "required" : "optional";
								return `- \`${param.name}\` (\`${param.js_type}\`, ${required}): ${param.description}`;
							})
							.join("\n");
			const actionTag = entry.action ? ` _(action: \`${entry.action}\`)_` : "";
			return [
				`### \`${entry.namespace}.${entry.name}\`${actionTag}`,
				"",
				entry.description,
				"",
				"**Parameters**",
				"",
				params,
				"",
				`**Returns** \`${entry.returns.js_type}\`: ${entry.returns.description}`,
			].join("\n");
		})
		.join("\n\n");
}

function renderNamespaceIndex(entries: ExtensionJsApiEntry[]): string {
	if (entries.length === 0) return "No API documentation matched that filter.";

	const byNamespace = new Map<string, ExtensionJsApiEntry[]>();
	for (const entry of entries) {
		const list = byNamespace.get(entry.namespace) ?? [];
		list.push(entry);
		byNamespace.set(entry.namespace, list);
	}

	const sortedNamespaces = [...byNamespace.keys()].sort();
	return sortedNamespaces
		.map((ns) => {
			const list = byNamespace.get(ns) ?? [];
			const functions = list
				.map((e) => {
					const sig = e.action
						? `${e.name}(...) -> ${e.returns.js_type}`
						: `${e.name} = ${e.returns.js_type}`;
					return `- \`${sig}\``;
				})
				.join("\n");
			return `### ${ns} (${list.length})\n${functions}`;
		})
		.join("\n\n");
}

async function getExtensionJsDocs(
	getDocs: (format: "json" | "markdown") => Promise<string>,
	format: string,
	namespace?: string,
): Promise<string> {
	const normalizedFormat = format === "json" ? "json" : "markdown";

	// Always get JSON for filtering
	const rawDocs = await getDocs("json");
	const allEntries = JSON.parse(rawDocs).filter(isApiEntry);

	const wanted = namespace?.trim();
	if (!wanted) {
		return normalizedFormat === "json"
			? JSON.stringify(allEntries, null, 2)
			: renderNamespaceIndex(allEntries);
	}

	const filtered = allEntries.filter(
		(entry: ExtensionJsApiEntry) =>
			entry.namespace === wanted ||
			entry.namespace.startsWith(`${wanted}.`) ||
			`${entry.namespace}.${entry.name}`.startsWith(`${wanted}.`),
	);

	return normalizedFormat === "json"
		? JSON.stringify(filtered, null, 2)
		: renderMarkdownDocs(filtered);
}

function truncateToolResult(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const head = Math.floor(maxChars / 2);
	const tail = maxChars - head;
	return `${text.slice(0, head)}\n\n... [truncated ${text.length - maxChars} chars] ...\n\n${text.slice(-tail)}`;
}

function classifyError(
	source: {
		kind?: string;
		message?: string;
		action?: string | null;
		code?: string | null;
		stack?: string | null;
		name?: string | null;
	},
	cellCode?: string,
): { code: string; hint: string; stack?: string } {
	const stack = isStackUseful(source.stack) ? source.stack : undefined;
	const base = classifyErrorBase(source, cellCode);
	return stack ? { ...base, stack } : base;
}

function classifyErrorBase(
	source: {
		kind?: string;
		message?: string;
		code?: string | null;
		name?: string | null;
	},
	jsSource?: string,
): { code: string; hint: string } {
	if (source.kind === "compile" || source.message?.includes("compile error"))
		return { code: "E_JS_COMPILE", hint: "Fix the syntax error and retry." };
	if (source.kind === "fuel_exhausted" || source.message?.includes("timed out"))
		return {
			code: "E_JS_TIMEOUT",
			hint: "The runtime has been rebuilt. Retry the same code.",
		};
	// Use the structured code from the CellError when available (e.g. E_CONTENT_SCRIPT,
	// E_PERMISSION, E_STALE) so the hint matches the actual failure mode.
	const errCode = source.code;
	if (errCode === "E_CONTENT_SCRIPT")
		return {
			code: errCode,
			hint: "The content script is not connected. Navigate to the tab or ask the user to refresh it.",
		};
	if (errCode === "E_PERMISSION")
		return {
			code: errCode,
			hint: "A permission error occurred. Check that the target is a normal http(s) page tab.",
		};
	if (errCode === "E_STALE")
		return {
			code: errCode,
			hint: "The element refId is stale. Take a fresh snapshot and use the new refIds.",
		};
	if (errCode === "E_NOT_FOUND")
		return {
			code: errCode,
			hint: "No matching element found. Take a fresh snapshot and verify the label or refId.",
		};
	if (errCode === "E_OBSERVATION_REQUIRED")
		return {
			code: errCode,
			hint: "The action requires a fresh observation. Call `await page.snapshot_data()` and use a refId from the returned nodes.",
		};
	if (errCode === "E_AMBIGUOUS_TARGET")
		return {
			code: errCode,
			hint: "The label matched multiple observed elements. Use a refId from `page.snapshot_data()` instead of a label.",
		};
	if (errCode === "E_NO_TAB")
		return {
			code: errCode,
			hint: "No active tab resolved. Ensure the user is focused on an http(s) page, not chrome://.",
		};
	if (
		errCode === "E_JS_RUNTIME" &&
		source.message?.includes("recursive use of an object")
	) {
		return {
			code: "E_JS_RUNTIME",
			hint: "The JS runtime was re-entered mid-cell and has been rebuilt. Retry the same code in a new run_js cell; do not refresh the target tab — the acting runtime, not the content script, failed.",
		};
	}
	if (errCode === "E_TIMEOUT")
		return {
			code: errCode,
			hint: "The operation timed out. The page may be slow or the selector may not appear.",
		};
	// QuickJS strips the message from engine-thrown TypeErrors, so an empty-message
	// runtime error is opaque. When the failing cell used page.* (which targets the
	// runner's notion of the active tab — often the side panel after web.tab.activate),
	// steer the agent toward web.tab.* with an explicit tabId, which is unambiguous.
	const isOpaqueRuntimeError =
		(source.kind === "runtime" || source.kind === undefined) &&
		(errCode === "E_JS_RUNTIME" || errCode === undefined || errCode === null) &&
		(!source.message || source.message.trim() === "");
	if (isOpaqueRuntimeError && callsSetTimeout(jsSource)) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A TypeError occurred in a cell using setTimeout/setInterval. The sandbox has NO setTimeout — use `await web.sleep(ms)` to wait. Replace `await new Promise(r => setTimeout(r, N))` with `await web.sleep(N)`.",
		};
	}
	if (isOpaqueRuntimeError && callsPageStar(jsSource)) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A TypeError occurred in a page.* call. page.* targets the runner's active tab, which is often the Browsergent side panel (a chrome-extension:// page) after web.tab.activate races. Use web.tab.* with an explicit tabId instead — e.g. web.tab.snapshot(tabId), web.tab.click({ tabId, refId }).",
		};
	}
	if (isOpaqueRuntimeError && callsWebTabStar(jsSource)) {
		return {
			code: errCode ?? "E_JS_RUNTIME",
			hint: "A TypeError occurred in a web.tab.* call. This usually happens when a click triggers a navigation or SPA re-render and the follow-up snapshot runs before the content script reconnects, OR the cell used setTimeout (use `await web.sleep(ms)` instead). Split click and snapshot into separate run_js cells with `await web.sleep(800)` between them, or navigate directly via page.goto with a parameterised search URL.",
		};
	}
	return {
		code: errCode ?? "E_JS_RUNTIME",
		hint: "Check the error details and try a different approach.",
	};
}

function callsWebTabStar(jsSource?: string): boolean {
	if (!jsSource) return false;
	return /\bweb\.tab\./.test(jsSource);
}
function callsPageStar(jsSource?: string): boolean {
	if (!jsSource) return false;
	return /\bpage\./.test(jsSource);
}
function callsSetTimeout(jsSource?: string): boolean {
	if (!jsSource) return false;
	return /\bsetTimeout\b|\bsetInterval\b/.test(jsSource);
}

const RUN_JS_DESCRIPTION = JS_TOOL_PROMPT;

const FILE_LIST_DESCRIPTION = `List all files in the shared OPFS filesystem (rooted at /).
Returns each file's path, name, size, mime, and isText flag. Binary files (isText=false)
cannot be read with file_read.`;

const FILE_READ_DESCRIPTION = `Read text content from a file.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md"). Relative paths resolve against root "/".
- Use file_list to discover paths.
- Returns the text content; long files are truncated with a [truncated] marker.
- Binary files return E_FILE_BINARY.
Prefer this over run_js when you just want to read a file's content.`;

const FILE_EDIT_DESCRIPTION = `Apply an exact text replacement to a file.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md"). Relative paths resolve against root "/".
- Use file_list to discover paths.
- \`old_string\` must match the file content exactly (indentation, whitespace, quotes).
- If \`old_string\` matches multiple locations, the call fails unless \`replace_all\` is true.`;

const FILE_DELETE_DESCRIPTION = `Permanently remove a file from the shared OPFS filesystem.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md").
- Cannot be undone. Use only when the user asks to delete or when a file is no longer needed.`;

const FILE_WRITE_DESCRIPTION = `Create or overwrite a text file at the given path.
- \`path\` is the file path (e.g. "/foo.md" or "sub/bar.md"). Relative paths resolve against root "/".
- \`content\` is the new file body (UTF-8 text).
- Auto-creates parent directories. Overwrites if the file exists.
- Prefer this over run_js+fs.writeText when you just need to write a file.`;

const FILE_PATH_HELP =
	'Call file_list first to see available paths. Paths may be absolute ("/foo.md") or relative ("foo.md" resolves to "/foo.md").';
const MAX_FILE_READ_CHARS = 50_000;

function validateFileToolPath(path: string): string | null {
	const trimmed = path.trim();
	if (!trimmed) return "path must not be empty";
	if (trimmed.includes("..")) return "path must not contain '..'";
	if (trimmed.includes("\\")) return "path must not contain backslashes";
	if (trimmed.includes("\0")) return "path must not contain null bytes";
	return null;
}

function formatFileOpError(err: unknown): string {
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

function truncateFileContent(content: string): {
	text: string;
	truncated: boolean;
} {
	if (content.length <= MAX_FILE_READ_CHARS) {
		return { text: content, truncated: false };
	}
	const marker = "\n\n[truncated]\n\n";
	const budget = MAX_FILE_READ_CHARS - marker.length;
	const head = Math.ceil(budget / 2);
	const tail = budget - head;
	return {
		text:
			content.slice(0, head) + marker + (tail > 0 ? content.slice(-tail) : ""),
		truncated: true,
	};
}

function formatFileListResult(
	files: {
		id: string;
		name: string;
		size: number;
		mime: string;
		isText: boolean;
	}[],
): string {
	if (files.length === 0) return "No files in session.";
	const header = "name\tsize\tmime\tisText";
	const rows = files.map(
		(f) => `${f.name}\t${f.size}\t${f.mime}\t${f.isText ? "yes" : "no"}`,
	);
	return [header, ...rows].join("\n");
}

function formatFileReadResult(
	content: string,
	bytes: number,
	truncated: boolean,
): string {
	const head = truncated ? `[truncated — file is ${bytes} bytes]\n\n` : "";
	return head + content;
}

function formatFileEditResult(
	occurrences: number,
	bytes: number,
	name: string,
): string {
	return `Edited ${name}: replaced ${occurrences} occurrence${occurrences === 1 ? "" : "s"}; file is now ${bytes} bytes.`;
}

export function createAgentTools(
	runJs: (code: string) => Promise<CellResult>,
	getDocs: (format: "json" | "markdown") => Promise<string>,
	loadSkill: (skill: string, path?: string) => Promise<string>,
	fileOp: (op: FileOp) => Promise<FileOpResult>,
): AgentTools {
	const definitions: AgentToolDefinition[] = [
		{
			name: "run_js",
			description: RUN_JS_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					code: {
						type: "string",
						description:
							"Inline JS code to execute. Mutually exclusive with 'file'.",
					},
					file: {
						type: "object",
						properties: {
							name: {
								type: "string",
								description:
									'Name of an uploaded session file to execute (e.g. "script.js"). Use file_list to discover names.',
							},
						},
						required: ["name"],
						description:
							"Reference to an uploaded file. Mutually exclusive with 'code'.",
					},
				},
			},
			run: async (input: unknown) => {
				const parsed = z
					.object({
						code: z.string().optional(),
						file: z.object({ name: z.string() }).optional(),
					})
					.safeParse(input);
				if (!parsed.success) {
					return "run_js input must be an object with 'code' (string) and/or 'file' ({ name: string })";
				}
				const hasCode =
					parsed.data.code !== undefined && parsed.data.code.trim().length > 0;
				const hasFile =
					parsed.data.file !== undefined &&
					parsed.data.file.name.trim().length > 0;
				if (hasCode && hasFile) {
					return formatToolError(
						"E_JS_INVALID_INPUT",
						"Provide exactly one of 'code' or 'file' — they are mutually exclusive",
						"",
					);
				}
				if (!hasCode && !hasFile) {
					return "run_js requires a non-empty 'code' string or a 'file' with non-empty 'name'";
				}

				let code: string;
				if (hasFile) {
					const fileName = parsed.data.file?.name;
					if (!fileName) {
						return "run_js requires a non-empty 'code' string or a 'file' with non-empty 'name'";
					}
					const pathError = validateFileToolPath(fileName);
					if (pathError) {
						return formatToolError(
							"E_FILE_PATH_SCOPE",
							pathError,
							FILE_PATH_HELP,
						);
					}
					try {
						const readResult = await fileOp({ op: "read", path: fileName });
						if (readResult.op !== "read") {
						return formatToolError(
							"E_FILE_UNKNOWN",
							`Unexpected result op for file_read: ${readResult.op}`,
							"",
						);
						}
						code = readResult.content;
					} catch (err) {
						return formatFileOpError(err);
					}
				} else {
					code = parsed.data.code ?? "";
				}

				if (!code.trim()) {
					return "run_js requires a non-empty 'code' string";
				}

				try {
					const result = await runJs(code);
					const traceId = getCurrentTraceId();
					const tracePrefix = traceId ? `[${traceId}] ` : "";
					if (result.status === "err") {
						const err = result.error as {
							kind: string;
							message?: string;
							action?: string | null;
							code?: string | null;
							stack?: string | null;
						};
					const { code: errCode, hint, stack } = classifyError(err, code);
						return formatToolError(
							errCode,
							`${tracePrefix}${formatJsRunResult(result)}`,
							hint,
							stack,
						);
					}
					const formatted = formatJsRunResult(result);
					const prefixed = tracePrefix
						? formatted
								.split("\n")
								.map((line) => `${tracePrefix}${line}`)
								.join("\n")
						: formatted;
					return truncateToolResult(prefixed, 50000);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					const traceId = getCurrentTraceId();
					const tracePrefix = traceId ? `[${traceId}] ` : "";
					const stack =
						err instanceof Error && err.stack ? err.stack : undefined;
					const { code: errCode, hint } = classifyError({
						message: msg,
						stack,
					});
					return formatToolError(errCode, `${tracePrefix}${msg}`, hint, stack);
				}
			},
		},
		{
			name: "get_doc",
			description:
				"Return extension-js API documentation. Call this BEFORE every run_js that uses APIs you are not 100% sure about.\n\nWorkflow:\n1. Call get_doc with no arguments to get a compact index of all namespaces.\n2. Call get_doc with namespace='page' (or whichever) to get full details.\n\nNever guess function names or argument shapes — always verify with get_doc first.",
			inputSchema: {
				type: "object",
				properties: {
					format: {
						type: "string",
						enum: ["markdown", "json"],
						description: "Documentation format. Defaults to markdown.",
					},
					namespace: {
						type: "string",
						description:
							"Namespace to get full docs for, such as page, chrome, web, fs, or sidepanel. Omit to get the compact index.",
					},
				},
			},
			run: async (input: unknown) => {
				const parsed = z
					.object({
						format: z.string().optional(),
						namespace: z.string().optional(),
					})
					.safeParse(input);
				const format = parsed.data?.format ?? "markdown";
				const namespace = parsed.data?.namespace;
				try {
					const docs = await getExtensionJsDocs(getDocs, format, namespace);
					return truncateToolResult(docs, 50000);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					return formatToolError(
						"E_JS_RUNTIME",
						msg,
						"Check the error details and try a different approach.",
					);
				}
			},
		},
		{
			name: "load_skill",
			description:
				"Load a Browsergent skill body or resource file. Use when following a skill from the catalog or when a skill references files under references/.",
			inputSchema: {
				type: "object",
				properties: {
					skill: {
						type: "string",
						description: "Skill name, e.g. capability-check",
					},
					path: {
						type: "string",
						description:
							"Optional relative path under the skill directory, e.g. references/checklist.md",
					},
				},
				required: ["skill"],
			},
			run: async (input: unknown) => {
				const parsed = z
					.object({
						skill: z.string(),
						path: z.string().optional(),
					})
					.safeParse(input);
				if (!parsed.success || !parsed.data.skill.trim()) {
					return formatToolError(
						"E_SKILL_INVALID",
						"load_skill requires a non-empty skill name",
						'Call load_skill with { skill: "skill-name" } from the catalog.',
					);
				}
				const { skill, path: resourcePath } = parsed.data;
				if (resourcePath?.includes("..")) {
					return formatToolError(
						"E_SKILL_PATH_FORBIDDEN",
						"Skill resource path must not contain ..",
						"Use a path relative to the skill directory without .. segments.",
					);
				}
				try {
					const content = await loadSkill(skill, resourcePath);
					return truncateToolResult(content, 50000);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					if (msg.includes("disable-model-invocation")) {
						return formatToolError(
							"E_SKILL_INVOCATION_FORBIDDEN",
							msg,
							"Ask the user to activate this skill with /skill:name at compose time.",
						);
					}
					return formatToolError(
						"E_SKILL_NOT_FOUND",
						msg,
						"Check skill names in the catalog or ask the user to activate with /skill:name.",
					);
				}
			},
		},
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
					const { text, truncated } = truncateFileContent(result.content);
					return formatFileReadResult(text, result.bytes, truncated);
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

	return {
		definitions,
		getHandler(name: string) {
			const def = definitions.find((d) => d.name === name);
			return def?.run ?? null;
		},
	};
}
