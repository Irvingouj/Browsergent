import type { AgentToolDefinition, AgentTools } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import type { CellResult } from "../types/extjs-utils";
import { formatJsRunResult } from "../types/extjs-utils";
import { JS_TOOL_PROMPT } from "./js-tool-prompt";
import { formatToolError } from "./tool-error-result";

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

function classifyError(source: {
	kind?: string;
	message?: string;
	action?: string | null;
	code?: string | null;
}): { code: string; hint: string } {
	if (source.kind === "compile" || source.message?.includes("compile error"))
		return { code: "E_JS_COMPILE", hint: "Fix the syntax error and retry." };
	if (source.kind === "fuel_exhausted" || source.message?.includes("timed out"))
		return {
			code: "E_JS_TIMEOUT",
			hint: "The runtime has been rebuilt. Retry the same code.",
		};
	// Use the structured code from the CellError when available (e.g. E_CONTENT_SCRIPT,
	// E_PERMISSION, E_STALE) so the hint matches the actual failure mode.
	const cellCode = source.code;
	if (cellCode === "E_CONTENT_SCRIPT")
		return {
			code: cellCode,
			hint: "The content script is not connected. Navigate to the tab or ask the user to refresh it.",
		};
	if (cellCode === "E_PERMISSION")
		return {
			code: cellCode,
			hint: "A permission error occurred. Check that the target is a normal http(s) page tab.",
		};
	if (cellCode === "E_STALE")
		return {
			code: cellCode,
			hint: "The element refId is stale. Take a fresh snapshot and use the new refIds.",
		};
	if (cellCode === "E_NOT_FOUND")
		return {
			code: cellCode,
			hint: "No matching element found. Take a fresh snapshot and verify the label or refId.",
		};
	if (cellCode === "E_NO_TAB")
		return {
			code: cellCode,
			hint: "No active tab resolved. Ensure the user is focused on an http(s) page, not chrome://.",
		};
	if (cellCode === "E_TIMEOUT")
		return {
			code: cellCode,
			hint: "The operation timed out. The page may be slow or the selector may not appear.",
		};
	return {
		code: cellCode ?? "E_JS_RUNTIME",
		hint: "Check the error details and try a different approach.",
	};
}

const RUN_JS_DESCRIPTION = JS_TOOL_PROMPT;

export function createAgentTools(
	runJs: (code: string) => Promise<CellResult>,
	getDocs: (format: "json" | "markdown") => Promise<string>,
	loadSkill: (skill: string, path?: string) => Promise<string>,
): AgentTools {
	const definitions: AgentToolDefinition[] = [
		{
			name: "run_js",
			description: RUN_JS_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					code: { type: "string", description: "JavaScript code to execute" },
				},
				required: ["code"],
			},
			run: async (input: unknown) => {
				const parsed = z.object({ code: z.string() }).safeParse(input);
				if (!parsed.success) {
					return "run_js requires a non-empty 'code' string";
				}
				const code = parsed.data.code;
				if (!code.trim()) {
					return "run_js requires a non-empty 'code' string";
				}
				try {
					const result = await runJs(code);
					if (result.status === "err") {
						const { code: errCode, hint } = classifyError({
							kind: result.error.kind,
							message: result.error.message,
							action: result.error.action,
							code: result.error.code,
						});
						return formatToolError(errCode, formatJsRunResult(result), hint);
					}
					return truncateToolResult(formatJsRunResult(result), 50000);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					const { code: errCode, hint } = classifyError({ message: msg });
					return formatToolError(errCode, msg, hint);
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
						"Call load_skill with { skill: \"skill-name\" } from the catalog.",
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
	];

	return {
		definitions,
		getHandler(name: string) {
			const def = definitions.find((d) => d.name === name);
			return def?.run ?? null;
		},
	};
}
