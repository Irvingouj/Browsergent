/**
 * Agent loop: drives the SDK Agent through LLM calls and Lua tool execution.
 *
 * The LLM has ONE tool: run_lua. It generates Lua code.
 * AgentLoop delegates execution to the side panel's ExtensionSession
 * via the runLua relay — it never touches the Lua runtime directly.
 */

import type { AgentEvent, AgentMessage, ToolCall } from "@pi-oxide/pi-host-web";
import { Agent, toolError, toolResult } from "@pi-oxide/pi-host-web";
import type { CellResult } from "../types/extension-lua";
import { formatCellResult } from "../types/extension-lua";
import type { AgentStatus, AgentTraceEntry } from "../types/messages";
import type { AnthropicConfig } from "./anthropic";
import { AnthropicProvider, SYSTEM_PROMPT } from "./anthropic";

export interface AgentLoopCallbacks {
	onStatus: (status: AgentStatus, reason?: string) => void;
	onMessage: (kind: "user" | "assistant" | "system", text: string) => void;
	onTextDelta?: (messageId: string, text: string) => void;
	onTrace: (entry: AgentTraceEntry) => void;
	onError: (code: string, message: string) => void;
	runLua: (code: string) => Promise<CellResult>;
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

const MAX_TOOL_RESULT_CHARS = 8000;

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

export class AgentLoop {
	private agent: Agent | null = null;
	private aborted = false;
	private abortController: AbortController | null = null;
	private stepCount = 0;

	async run(
		task: string,
		maxSteps: number,
		config: AnthropicConfig,
		callbacks: AgentLoopCallbacks,
		priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [],
	): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
		this.aborted = false;
		this.stepCount = 0;
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
			tools: [RUN_LUA_TOOL],
			tool_execution_mode: "sequential",
			messages:
				priorMessages.length > 0
					? toSdkMessages(priorMessages, config.model)
					: undefined,
		});

		callbacks.onStatus("running");
		callbacks.onMessage("user", task);

		const messages: Array<{ role: "user" | "assistant"; content: string }> = [
			...priorMessages,
			{ role: "user", content: task },
		];

		try {
			const provider = new AnthropicProvider(
				config,
				this.abortController.signal,
			);

			await this.agent.run(task, {
				llm: provider,
				tools: {
					run_lua: async (call: ToolCall) => {
						if (this.aborted) {
							return toolError("aborted", "Agent stopped");
						}

						if (this.stepCount >= maxSteps) {
							this.aborted = true;
							callbacks.onStatus("stopped", `Max steps reached (${maxSteps})`);
							return toolError("max_steps", `Max steps reached (${maxSteps})`);
						}
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
							id: `lua-${Date.now()}`,
							step: this.stepCount,
							status: "running",
							toolName: "run_lua",
							toolInput: code.slice(0, 200),
							timestamp: Date.now(),
						});

						try {
							const cell = await callbacks.runLua(code);
							const text = formatCellResult(cell);
							messages.push({
								role: "user",
								content:
									cell.error === null
										? `[run_lua]\n${text}`
										: `[run_lua] ERROR: ${text}`,
							});
							if (cell.error === null) {
								const projected =
									text.length > MAX_TOOL_RESULT_CHARS
										? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[...truncated]`
										: text;
								return toolResult(projected);
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
		} finally {
			this.agent?.destroy();
			this.agent = null;
		}

		return messages;
	}

	stop(): void {
		this.aborted = true;
		this.abortController?.abort();
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
