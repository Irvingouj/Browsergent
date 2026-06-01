import type { AgentTools, AgentToolDefinition } from "@pi-oxide/pi-host-web";
import type { LuaRunResult } from "@pi-oxide/extension-lua";
import { formatCellResult } from "../types/lua-utils";

interface ExtensionLuaApiEntry {
	namespace: string;
	name: string;
	action: string | null;
	description: string;
	params: ReadonlyArray<{
		name: string;
		lua_type: string;
		required: boolean;
		description: string;
	}>;
	returns: {
		lua_type: string;
		description: string;
	};
}

function isApiEntry(value: unknown): value is ExtensionLuaApiEntry {
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

function renderMarkdownDocs(entries: ExtensionLuaApiEntry[]): string {
	if (entries.length === 0) return "No API documentation matched that filter.";
	return entries
		.map((entry) => {
			const params =
				entry.params.length === 0
					? "- none"
					: entry.params
							.map((param) => {
								const required = param.required ? "required" : "optional";
								return `- \`${param.name}\` (\`${param.lua_type}\`, ${required}): ${param.description}`;
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
				`**Returns** \`${entry.returns.lua_type}\`: ${entry.returns.description}`,
			].join("\n");
		})
		.join("\n\n");
}

function renderNamespaceIndex(entries: ExtensionLuaApiEntry[]): string {
	if (entries.length === 0) return "No API documentation matched that filter.";

	const byNamespace = new Map<string, ExtensionLuaApiEntry[]>();
	for (const entry of entries) {
		const list = byNamespace.get(entry.namespace) ?? [];
		list.push(entry);
		byNamespace.set(entry.namespace, list);
	}

	const sortedNamespaces = [...byNamespace.keys()].sort();
	return sortedNamespaces
		.map((ns) => {
			const list = byNamespace.get(ns)!;
			const functions = list
				.map((e) => {
					const sig = e.action
						? `${e.name}(...) -> ${e.returns.lua_type}`
						: `${e.name} = ${e.returns.lua_type}`;
					return `- \`${sig}\``;
				})
				.join("\n");
			return `### ${ns} (${list.length})\n${functions}`;
		})
		.join("\n\n");
}

async function getExtensionLuaDocs(
	format: string,
	namespace?: string,
): Promise<string> {
	if (typeof self !== "undefined" && typeof window === "undefined") {
		(globalThis as unknown as Record<string, unknown>).window = self;
	}
	const { generateApiDocsJson } = await import("@pi-oxide/extension-lua");
	const normalizedFormat = format === "json" ? "json" : "markdown";

	const allEntries = generateApiDocsJson().filter(isApiEntry);

	const wanted = namespace?.trim();
	if (!wanted) {
		return normalizedFormat === "json"
			? JSON.stringify(allEntries, null, 2)
			: renderNamespaceIndex(allEntries);
	}

	const filtered = allEntries.filter(
		(entry) =>
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

const RUN_LUA_DESCRIPTION = `Execute Lua code to control the browser via extension-lua runtime.
ALWAYS call get_doc first when you need any tab.*, chrome.*, json, runtime, or web API. Do not guess function names, argument shapes, or return types.

## Browsergent-specific rules
- The target web page is controlled through tab.* APIs. Start with \`local tab_id = tab.current()\`.
- Use \`tab.snapshot(tab_id)\` to get a human-readable page summary for observation.
- Use \`tab.snapshot_data(tab_id)\` only when you need structured element nodes with ref_ids.
- Use \`tab.url(tab_id)\` and \`tab.title(tab_id)\` for page metadata.
- Use \`tab.open(url)\` to navigate/open a URL when the user asks to go somewhere.
- Ref_ids from snapshot_data are snapshot-scoped. Never guess them, and refresh the snapshot_data before acting if the page changed.
- You can combine multiple tab.* calls in one Lua block when the sequence is clear.
- Use \`print(...)\` to return concise observations to the trace.
- Use tab.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.
- Do not use \`tab.evaluate\`, \`tab.execute_script\`, or \`chrome.scripting.executeScript\`; Browsergent forbids arbitrary JS execution.`;

export function createAgentTools(
	runLua: (code: string) => Promise<LuaRunResult>,
): AgentTools {
	const definitions: AgentToolDefinition[] = [
		{
			name: "run_lua",
			description: RUN_LUA_DESCRIPTION,
			inputSchema: {
				type: "object",
				properties: {
					code: { type: "string", description: "Lua code to execute" },
				},
				required: ["code"],
			},
			run: async (input: unknown) => {
				const args = input as Record<string, unknown>;
				const code = args.code;
				if (typeof code !== "string" || !code.trim()) {
					return "run_lua requires a non-empty 'code' string";
				}
				const result = await runLua(code);
				const text = formatCellResult(result);
				return truncateToolResult(text, 50000);
			},
		},
		{
			name: "get_doc",
			description:
				"Return extension-lua API documentation. Call this BEFORE every run_lua that uses APIs you are not 100% sure about.\n\nWorkflow:\n1. Call get_doc with no arguments to get a compact index of all namespaces.\n2. Call get_doc with namespace='tab' (or whichever) to get full details.\n\nNever guess function names or argument shapes — always verify with get_doc first.",
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
							"Namespace to get full docs for, such as tab, chrome.tabs, json, runtime, or web. Omit to get the compact index.",
					},
				},
			},
			run: async (input: unknown) => {
				const args = input as Record<string, unknown>;
				const format = typeof args.format === "string" ? args.format : "markdown";
				const namespace = typeof args.namespace === "string" ? args.namespace : undefined;
				const docs = await getExtensionLuaDocs(format, namespace);
				return truncateToolResult(docs, 50000);
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
