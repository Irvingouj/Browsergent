import type { AgentToolDefinition, AgentTools } from "@pi-oxide/pi-host-web";
import type { LuaRunResult } from "../types/lua-utils";
import { formatCellResult } from "../types/lua-utils";
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
	format: string,
	namespace?: string,
): Promise<string> {
	if (typeof self !== "undefined" && typeof window === "undefined") {
		(globalThis as unknown as Record<string, unknown>).window = self;
	}
	const { generateApiDocs } = await import("@pi-oxide/extension-js");
	const normalizedFormat = format === "json" ? "json" : "markdown";

	const rawDocs = generateApiDocs("json");
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

function classifyError(source: { kind?: string; message?: string }): {
	code: string;
	hint: string;
} {
	if (source.kind === "compile" || source.message?.includes("compile error"))
		return { code: "E_LUA_COMPILE", hint: "Fix the syntax error and retry." };
	if (source.kind === "fuel_exhausted" || source.message?.includes("timed out"))
		return {
			code: "E_LUA_TIMEOUT",
			hint: "The runtime has been rebuilt. Retry the same code.",
		};
	if (source.message?.includes("runtime error"))
		return {
			code: "E_LUA_RUNTIME",
			hint: "Check the error, fix the code, and retry.",
		};
	return {
		code: "E_LUA_RUNTIME",
		hint: "Check the error details and try a different approach.",
	};
}

const RUN_JS_DESCRIPTION = `Execute JavaScript code to control the browser via the extension-js runtime.
ALWAYS call get_doc first when you need any page.*, web.*, chrome.*, or fs API. Do not guess function names, argument shapes, or return types.

## Browsergent-specific rules
- The target web page is controlled through page.* APIs.
- Use \`await page.snapshot()\` to get a human-readable page summary for observation.
- Use \`await page.snapshot_data()\` only when you need structured element nodes with ref_ids.
- Use \`await page.url()\` and \`await page.title()\` for page metadata.
- Use \`await page.goto(url)\` to navigate/open a URL when the user asks to go somewhere.
- Ref_ids from snapshot_data are snapshot-scoped. Never guess them, and refresh the snapshot_data before acting if the page changed.
- You can combine multiple page.* calls in one async function block when the sequence is clear.
- Use \`console.log(...)\` or \`web.log(...)\` to return concise observations to the trace.
- Use page.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.
- Do not use \`page.evaluate\`, \`chrome.scripting.executeScript\`, or \`tab.evaluate\`; Browsergent forbids arbitrary JS execution outside the sandboxed runtime.

## Common patterns
Current page:
\`\`\`js
const tabId = await page.active_tab();
console.log("Tab:", tabId);
console.log("URL:", await page.url());
console.log("Title:", await page.title());
console.log(await page.snapshot());
\`\`\`

Navigate:
\`\`\`js
await page.goto("https://www.linkedin.com");
\`\`\`

Inspect and interact (structured):
\`\`\`js
const data = await page.snapshot_data();
// choose a real ref_id from data, then:
// await page.fill("e3", "search text");
// await page.click("e4");
// await page.type(ref_id, text);
// await page.press(key);
// await page.select(ref_id, value);
// await page.check(ref_id);
// await page.scroll(direction, amount);
\`\`\``;

export function createAgentTools(
	runLua: (code: string) => Promise<LuaRunResult>,
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
				const args = input as Record<string, unknown>;
				const code = args.code;
				if (typeof code !== "string" || !code.trim()) {
					return "run_js requires a non-empty 'code' string";
				}
				try {
					const result = await runLua(code);
					if (result.status === "err") {
						const { code: errCode, hint } = classifyError({
							kind: result.error.kind,
						});
						return formatToolError(errCode, formatCellResult(result), hint);
					}
					return truncateToolResult(formatCellResult(result), 50000);
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
				const args = input as Record<string, unknown>;
				const format =
					typeof args.format === "string" ? args.format : "markdown";
				const namespace =
					typeof args.namespace === "string" ? args.namespace : undefined;
				try {
					const docs = await getExtensionJsDocs(format, namespace);
					return truncateToolResult(docs, 50000);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					return formatToolError(
						"E_LUA_RUNTIME",
						msg,
						"Check the error details and try a different approach.",
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
