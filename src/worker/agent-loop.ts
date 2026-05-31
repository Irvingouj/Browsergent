/**
 * Agent loop: drives the SDK Agent through LLM calls and Lua tool execution.
 *
 * The LLM executes browser actions through run_lua and can inspect the
 * extension-lua API through get_doc.
 * AgentLoop delegates execution to the side panel's ExtensionSession
 * via the runLua relay — it never touches the Lua runtime directly.
 */

import type { AgentEvent, AgentMessage, ContextProjectionState, LlmContext, LlmProvider, LlmStream, ProjectionStrategy, SessionState as SdkSessionState, ToolCall, ToolResultContext } from "@pi-oxide/pi-host-web";
import { Agent, projectContext, toolError } from "@pi-oxide/pi-host-web";
import type { LuaRunResult } from "@pi-oxide/extension-lua";
import { formatCellResult } from "../types/lua-utils";
import type { AgentStatus, AgentTraceEntry } from "../types/messages";
import type { AnthropicConfig } from "./anthropic";
import { AnthropicProvider, SYSTEM_PROMPT } from "./anthropic";

export interface AgentLoopCallbacks {
	onStatus: (status: AgentStatus, reason?: string) => void;
	onMessage: (kind: "user" | "assistant" | "system", text: string) => void;
	onTextDelta?: (messageId: string, text: string) => void;
	onTrace: (entry: AgentTraceEntry) => void;
	onError: (code: string, message: string) => void;
	runLua: (code: string) => Promise<LuaRunResult>;
}

const RUN_LUA_TOOL = {
	name: "run_lua",
	label: "Run Lua",
	description:
		"Execute Lua code to control the browser. Use tab.* API to interact with web pages.",
	parameters: {
		type: "object",
		properties: {
			code: { type: "string", description: "Lua code to execute" },
		},
		required: ["code"],
	},
	execution_mode: "sequential" as const,
};

const GET_DOC_TOOL = {
	name: "get_doc",
	label: "Get Lua Docs",
	description:
		"Return extension-lua API documentation. Call this BEFORE any run_lua that uses APIs you are not 100% sure about.\n\nWorkflow:\n1. Call get_doc with no arguments to get a compact index of all namespaces (e.g. tab, chrome.tabs, json, runtime, web).\n2. Call get_doc with namespace='tab' (or whichever namespace you need) to get full parameter and return-type details for that namespace.\n\nNever guess function names or argument shapes — always verify with get_doc first.",
	parameters: {
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
					"Namespace to get full docs for, such as tab, chrome.tabs, json, runtime, or web. Omit to get the compact index of all namespaces.",
			},
		},
	},
	execution_mode: "sequential" as const,
};

const EMPTY_TOOL_RESULT = "[run_lua completed successfully with no output]";

function toolStrategy(toolName: string): ProjectionStrategy {
	if (toolName === "run_lua") {
		return { type: "fixed", shape: { type: "head_tail", head_chars: 8000, tail_chars: 8000 } };
	}
	return { type: "fixed", shape: { type: "keep_full" } };
}

function buildToolResult(
	text: string,
	contentKind: ToolResultContext["content_kind"],
	toolName: string,
	truncated = false,
): { content: Array<{ type: "text"; text: string }>; details: ToolResultContext } {
	const normalized = text.trim() || EMPTY_TOOL_RESULT;
	return {
		content: [{ type: "text", text: normalized }],
		details: {
			content_kind: contentKind,
			strategy: toolStrategy(toolName),
			original_chars: text.length,
			truncated_by_tool: truncated,
		},
	};
}

function toolResultText(result: {
	content?: Array<{ type: string; text?: string }>;
}): string {
	return (
		result.content
			?.filter(
				(item): item is { type: "text"; text: string } =>
					item.type === "text" && typeof item.text === "string",
			)
			.map((item) => item.text)
			.join("\n") ?? ""
	);
}

function toolErrorText(result: unknown): string {
	// SDK tool_execution_end passes ToolResult for errors too — content may hold the error text
	const fromContent =
		typeof result === "object" &&
		result !== null &&
		"content" in result
			? toolResultText(
					result as { content?: Array<{ type: string; text?: string }> },
				)
			: "";
	if (fromContent) return fromContent;

	if (typeof result === "object" && result !== null && "error" in result) {
		const err = (result as { error?: { code?: string; message?: string } })
			.error;
		if (typeof err?.message === "string") return `Error: ${err.message}`;
		if (typeof err?.code === "string") return `Error: ${err.code}`;
	}
	return "Tool failed";
}

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

	// Group by namespace
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
	// Polyfill: extension-lua WASM init may reference window; Web Workers only have self.
	if (typeof self !== "undefined" && typeof window === "undefined") {
		(globalThis as unknown as Record<string, unknown>).window = self;
	}
	const { generateApiDocsJson } = await import("@pi-oxide/extension-lua");
	const normalizedFormat = format === "json" ? "json" : "markdown";

	const allEntries = generateApiDocsJson().filter(isApiEntry);

	const wanted = namespace?.trim();
	if (!wanted) {
		// No namespace: return compact index so the model knows what namespaces exist.
		return normalizedFormat === "json"
			? JSON.stringify(allEntries, null, 2)
			: renderNamespaceIndex(allEntries);
	}

	// Namespace filter: exact match, child namespaces, or function prefix.
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

function toSdkMessages(
	messages: Array<{ role: "user" | "assistant"; content: string }>,
	model: string,
): AgentMessage[] {
	return messages.map((m) =>
		m.role === "user"
			? {
					role: "user" as const,
					content: [{ type: "text" as const, text: m.content }],
					timestamp: Date.now(),
				}
			: {
					role: "assistant" as const,
					content: [{ type: "text" as const, text: m.content }],
					api: "anthropic",
					provider: "anthropic",
					model,
					stop_reason: "end_turn" as const,
					timestamp: Date.now(),
					usage: {
						input: 0,
						output: 0,
						cache_read: 0,
						cache_write: 0,
						total_tokens: 0,
					},
				},
	);
}


class ProjectingLlmProvider implements LlmProvider {
	constructor(
		private inner: LlmProvider,
		private state: ContextProjectionState,
	) {}

	async call(context: LlmContext, signal?: AbortSignal): Promise<LlmStream> {
		const result = projectContext({
			system_prompt: context.system_prompt,
			messages: context.messages,
			budget: {
				max_tool_result_chars: 50000,
				max_context_tokens: 100000,
				microcompact_after_turns: 5,
				compaction_threshold: 0.75,
			},
			state: this.state,
		});

		if (!result.ok || !result.data) {
			console.debug("projection error:", result.error);
			return this.inner.call(context, signal);
		}

		this.state = result.data.updated_state;
		return this.inner.call(
			{ ...context, messages: result.data.projected_messages },
			signal,
		);
	}

	getState(): ContextProjectionState {
		return this.state;
	}
}

export class AgentLoop {
	private agent: Agent | null = null;
	private aborted = false;
	private abortController: AbortController | null = null;
	private stepCount = 0;
	private toolCallNames = new Map<string, string>();

	async run(
		task: string,
		config: AnthropicConfig,
		callbacks: AgentLoopCallbacks,
		priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [],
		priorSessionState?: SdkSessionState,
	): Promise<{
		messages: Array<{ role: "user" | "assistant"; content: string }>;
		sessionState: SdkSessionState | null;
	}> {
		this.aborted = false;
		this.stepCount = 0;
		this.toolCallNames.clear();
		this.abortController = new AbortController();

		callbacks.onStatus("loading");

		this.agent = await Agent.create({
			system_prompt: SYSTEM_PROMPT,
			model: {
				id: config.model,
				name: config.model,
				api: "anthropic",
				provider: "anthropic",
				reasoning: false,
				context_window: 200_000,
				max_tokens: 4096,
				capabilities: {
					vision: false,
					json_mode: false,
					function_calling: true,
					streaming: true,
				},
				cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
			},
			thinking_level: "off",
			tools: [RUN_LUA_TOOL, GET_DOC_TOOL],
			tool_execution_mode: "sequential",
			messages:
				priorMessages.length > 0
					? toSdkMessages(priorMessages, config.model)
					: undefined,
			session_state: priorSessionState ?? null,
		});

		callbacks.onStatus("running");
		callbacks.onMessage("user", task);

		const messages: Array<{ role: "user" | "assistant"; content: string }> = [
			...priorMessages,
			{ role: "user", content: task },
		];

		let projectingProvider: ProjectingLlmProvider | null = null;
		const agent = this.agent;
		try {
			const provider = new AnthropicProvider(config);
			const projectionState: ContextProjectionState =
				priorSessionState?.projection_state ?? {
					tools: {},
					current_turn: 0,
					last_api_usage: null,
					turns_since_compaction: 0,
				};
			projectingProvider = new ProjectingLlmProvider(provider, projectionState);

			await this.agent.run(task, {
				llm: projectingProvider,
				tools: {
					get_doc: async (call: ToolCall) => {
						if (this.aborted) {
							return toolError("aborted", "Agent stopped");
						}

						this.toolCallNames.set(call.id, call.name);
						this.stepCount++;

						const args = call.arguments as Record<string, unknown>;
						const format =
							typeof args.format === "string" ? args.format : "markdown";
						const namespace =
							typeof args.namespace === "string" ? args.namespace : undefined;

						callbacks.onTrace({
							id: call.id,
							step: this.stepCount,
							status: "running",
							toolName: call.name,
							toolInput: `format=${format}${namespace ? ` namespace=${namespace}` : ""}`,
							timestamp: Date.now(),
						});

						try {
							const docs = await getExtensionLuaDocs(format, namespace);
							return buildToolResult(docs, "search_results", "get_doc");
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							return toolError("doc_error", msg);
						}
					},
					run_lua: async (call: ToolCall) => {
						if (this.aborted) {
							return toolError("aborted", "Agent stopped");
						}

						this.toolCallNames.set(call.id, call.name);
						this.stepCount++;

						const args = call.arguments as Record<string, unknown>;
						const code = args.code;
						if (typeof code !== "string" || !code.trim()) {
							return toolError(
								"invalid_input",
								"run_lua requires a non-empty 'code' string",
							);
						}

						callbacks.onTrace({
							id: call.id,
							step: this.stepCount,
							status: "running",
							toolName: call.name,
							toolInput: code.slice(0, 2000),
							timestamp: Date.now(),
						});

						try {
							const cell = await callbacks.runLua(code);
							const text = formatCellResult(cell);
							messages.push({
								role: "user",
								content:
									cell.status === "ok"
										? `[run_lua]\n${text}`
										: `[run_lua] ERROR: ${text}`,
							});
							if (cell.status === "ok") {
								return buildToolResult(text, "command_output", "run_lua");
							}
							return toolError("lua_error", text);
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							messages.push({
								role: "user",
								content: `[run_lua] ERROR: ${msg}`,
							});
							return toolError("lua_error", msg);
						}
					},
				},
				onEvent: (event: AgentEvent) => {
					this.handleEvent(event, callbacks, messages);
				},
				signal: this.abortController.signal,
			});

			if (!this.aborted) callbacks.onStatus("done");
		} catch (err) {
			if (this.aborted) {
				callbacks.onStatus("stopped", "Stopped by user");
			} else {
				const message = err instanceof Error ? err.message : String(err);
				callbacks.onError("agent_error", message);
				callbacks.onStatus("error", message);
			}
		}

		let sessionState: SdkSessionState | null = null;
		try {
			sessionState = agent?.getSessionState() ?? null;
		} catch {
			// ignore
		}
		agent?.destroy();
		this.agent = null;

		if (sessionState && projectingProvider) {
			const finalProjectionState = projectingProvider.getState();
			if (finalProjectionState) {
				sessionState = {
					...sessionState,
					projection_state: finalProjectionState,
				};
			}
		}

		return { messages, sessionState };
	}

	stop(): void {
		this.aborted = true;
		this.abortController?.abort();
		this.agent?.stop();
	}

	reset(): void {
		this.aborted = true;
		this.abortController?.abort();
		this.agent?.reset();
		this.agent = null;
	}

	private handleEvent(
		event: AgentEvent,
		callbacks: AgentLoopCallbacks,
		messages: Array<{ role: "user" | "assistant"; content: string }>,
	): void {
		switch (event.type) {
			case "message_update": {
				if (event.delta.kind === "text_delta") {
					callbacks.onTextDelta?.(
						event.message.timestamp.toString(),
						event.delta.text,
					);
				}
				break;
			}
			case "message_end": {
				if (event.message.role === "assistant") {
					const text = event.message.content
						.filter(
							(c): c is { type: "text"; text: string } => c.type === "text",
						)
						.map((c) => c.text)
						.join("");
					if (text) {
						messages.push({ role: "assistant", content: text });
					}
				}
				break;
			}
			case "tool_execution_start": {
				callbacks.onStatus("executing_tool");
				break;
			}
			case "tool_execution_end": {
				const errorText = event.is_error
					? toolErrorText(event.result)
					: toolResultText(event.result).slice(0, 8000);
				const resolvedToolName =
					this.toolCallNames.get(event.tool_call_id) ?? "run_lua";
				callbacks.onTrace({
					id: event.tool_call_id,
					step: this.stepCount,
					status: event.is_error ? "error" : "done",
					toolName: resolvedToolName,
					result: errorText,
					timestamp: Date.now(),
				});
				callbacks.onStatus("running");
				break;
			}
			case "tool_execution_cancelled": {
				const cancelledToolName =
					this.toolCallNames.get(event.tool_call_id) ?? "run_lua";
				callbacks.onTrace({
					id: event.tool_call_id,
					step: this.stepCount,
					status: "error",
					toolName: cancelledToolName,
					result: `Cancelled: ${event.reason}`,
					timestamp: Date.now(),
				});
				break;
			}
			case "turn_start":
				break;
			case "agent_end":
			case "settled":
			case "save_point":
			case "queue_update":
				break;
		}
	}
}
