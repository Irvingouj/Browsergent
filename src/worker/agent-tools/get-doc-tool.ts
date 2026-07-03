import type { AgentToolDefinition } from "@pi-oxide/pi-host-web";
import { z } from "zod";
import { formatToolError } from "../tool-error-result";

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

export function createGetDocTool(
	getDocs: (format: "json" | "markdown") => Promise<string>,
): AgentToolDefinition {
	return {
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
				return docs;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return formatToolError(
					"E_JS_RUNTIME",
					msg,
					"Check the error details and try a different approach.",
				);
			}
		},
	};
}
