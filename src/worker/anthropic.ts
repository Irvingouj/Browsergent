/**
 * AnthropicProvider — streams LLM responses for the raw WASM host API.
 *
 * Converts SDK AgentMessage[] → Anthropic wire format, streams SSE back as
 * LlmChunk / LlmResult.  The LLM has ONE tool: run_js.
 */

import type {
	AgentMessage,
	Content,
	LlmChunk,
	LlmContext,
	LlmResult,
	StopReason,
	ToolDefinition,
} from "@pi-oxide/pi-host-web/raw";

import type { LlmStream } from "./llm-streamer";

// ---------------------------------------------------------------------------
// Anthropic wire-format helpers (file-local, never exported)
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
	| { type: "text"; text: string }
	| {
			type: "tool_use";
			id: string;
			name: string;
			input: Record<string, unknown>;
	  }
	| {
			type: "tool_result";
			tool_use_id: string;
			content: string | AnthropicContentBlock[];
			is_error?: boolean;
	  };

interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SSE event types (file-local)
// ---------------------------------------------------------------------------

type AnthropicStreamEvent =
	| { type: "message_start"; message: unknown }
	| {
			type: "content_block_start";
			index: number;
			content_block:
				| { type: "text"; text: string }
				| {
						type: "tool_use";
						id: string;
						name: string;
						input: Record<string, unknown>;
				  };
	  }
	| {
			type: "content_block_delta";
			index: number;
			delta:
				| { type: "text_delta"; text: string }
				| { type: "input_json_delta"; partial_json: string };
	  }
	| { type: "content_block_stop"; index: number }
	| {
			type: "message_delta";
			delta: { stop_reason: string | null; stop_sequence: string | null };
			usage?: { output_tokens?: number };
	  }
	| { type: "message_stop" };

function isStreamEvent(value: unknown): value is AnthropicStreamEvent {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return (
		type === "message_start" ||
		type === "content_block_start" ||
		type === "content_block_delta" ||
		type === "content_block_stop" ||
		type === "message_delta" ||
		type === "message_stop"
	);
}

// ---------------------------------------------------------------------------
// Constants — kept for use by agent-loop.ts when creating the Agent
// ---------------------------------------------------------------------------

const BROWSERGENT_JS_GUIDANCE = [
	"Execute JavaScript code to control the browser via the extension-js runtime.",
	"ALWAYS call get_doc first when you need any page.*, web.*, chrome.*, or fs API. Do not guess function names, argument shapes, or return types.",
	"",
	"## Browsergent-specific rules",
	"- The target web page is controlled through page.* APIs.",
	"- Use `await page.snapshot()` to get a human-readable page summary for observation.",
	"- Use `await page.snapshot_data()` only when you need structured element nodes with ref_ids.",
	"- Use `await page.url()` and `await page.title()` for page metadata.",
	"- Use `await page.goto(url)` to navigate/open a URL when the user asks to go somewhere.",
	"- Ref_ids from snapshot_data are snapshot-scoped. Never guess them, and refresh the snapshot_data before acting if the page changed.",
	"- You can combine multiple page.* calls in one async function block when the sequence is clear.",
	"- Use `console.log(...)` or `web.log(...)` to return concise observations to the trace.",
	"- Use page.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.",
	"- Do not use `page.evaluate`, `chrome.scripting.executeScript`, or `tab.evaluate`; Browsergent forbids arbitrary JS execution.",
	"",
	"## Common patterns",
	"Current page:",
	"```js",
	'const tabId = await page.active_tab();',
	'console.log("Tab:", tabId);',
	'console.log("URL:", await page.url());',
	'console.log("Title:", await page.title());',
	'console.log(await page.snapshot());',
	"```",
	"",
	"Navigate:",
	"```js",
	'await page.goto("https://www.linkedin.com");',
	"```",
	"",
	"Inspect and interact (structured):",
	"```js",
	'const data = await page.snapshot_data();',
	"// choose a real ref_id from data, then:",
	'// await page.fill("e3", "search text");',
	'// await page.click("e4");',
	"// await page.type(ref_id, text);",
	"// await page.press(key);",
	"// await page.select(ref_id, value);",
	"// await page.check(ref_id);",
	"// await page.scroll(direction, amount);",
	"```",
].join("\n");

/** Tool definition in Anthropic wire format — used when constructing the agent. */
export const BROWSER_TOOLS: AnthropicTool[] = [
	{
		name: "run_js",
		description: BROWSERGENT_JS_GUIDANCE,
		input_schema: {
			type: "object",
			properties: {
				code: { type: "string", description: "JavaScript code to execute" },
			},
			required: ["code"],
		},
	},
	{
		name: "get_doc",
		description:
			"Return extension-js API documentation. Call this BEFORE every run_js that uses APIs you are not 100% sure about. Prefer get_doc over guessing.",
		input_schema: {
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
						"Optional namespace filter, such as page, chrome, web, fs, or sidepanel.",
				},
			},
		},
	},
];

export const SYSTEM_PROMPT = `You are Browsergent, a browser automation agent. You control the browser by generating JavaScript code via the run_js tool.

Use get_doc proactively. Before any run_js that touches APIs you are not 100% sure about, call get_doc to verify exact function names, argument order, and return types. Prefer get_doc over guessing.

Key rules:
1. Observe before acting.
2. Use latest snapshot refs — never guess ref_ids.
3. Prefer page.snapshot() for readable page observation; use page.snapshot_data() only when structured nodes are needed.
4. Verify after action.
5. Use docs instead of guessing.

Use page.* for target-tab automation. Use sidepanel.* only when explicitly controlling Browsergent's side panel.
Do not use page.evaluate, chrome.scripting.executeScript, or tab.evaluate.`;

// ---------------------------------------------------------------------------
// Config type — used by worker/index.ts
// ---------------------------------------------------------------------------

export interface AnthropicConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Helpers: extract plain text from Content[]
// ---------------------------------------------------------------------------

function contentToText(blocks: Content[]): string {
	return blocks
		.filter((b): b is { type: "text"; text: string } => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

// ---------------------------------------------------------------------------
// Message conversion: SDK AgentMessage → Anthropic wire format
// ---------------------------------------------------------------------------

function toAnthropicContent(block: Content): AnthropicContentBlock {
	switch (block.type) {
		case "text":
			return { type: "text", text: block.text };
		case "tool_call":
			return {
				type: "tool_use",
				id: block.id,
				name: block.name,
				input:
					typeof block.arguments === "object" && block.arguments !== null
						? (block.arguments as Record<string, unknown>)
						: {},
			};
		case "image":
			// Anthropic image blocks — not expected in Browsergent but handle gracefully
			return { type: "text", text: `[image: ${block.media_type}]` };
	}
}

function toAnthropicMessages(messages: AgentMessage[]): AnthropicMessage[] {
	const result: AnthropicMessage[] = [];

	for (const msg of messages) {
		switch (msg.role) {
			case "user": {
				if (msg.content.length === 1 && msg.content[0]?.type === "text") {
					result.push({
						role: "user",
						content: msg.content[0].text,
					});
				} else {
					result.push({
						role: "user",
						content: msg.content.map(toAnthropicContent),
					});
				}
				break;
			}
			case "assistant": {
				result.push({
					role: "assistant",
					content: msg.content.map(toAnthropicContent),
				});
				break;
			}
			case "tool_result": {
				// Anthropic puts tool results inside user messages
				const text = contentToText(msg.content);
				result.push({
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: msg.tool_call_id,
							content: text,
							is_error: msg.is_error,
						},
					],
				});
				break;
			}
		}
	}

	return result;
}

function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
	return tools.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema: t.parameters as Record<string, unknown>,
	}));
}

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

function toStopReason(raw: string | null): StopReason {
	switch (raw) {
		case "end_turn":
			return "end_turn";
		case "max_tokens":
			return "max_tokens";
		case "tool_use":
			return "tool_use";
		default:
			return "end_turn";
	}
}

// ---------------------------------------------------------------------------
// AnthropicProvider
// ---------------------------------------------------------------------------

export class AnthropicProvider {
	constructor(private config: AnthropicConfig) {}

	async call(
		context: LlmContext,
		signal?: AbortSignal,
	): Promise<LlmStream> {
		const baseUrl = this.config.baseUrl ?? "https://api.anthropic.com";
		const isFireworks = baseUrl.includes("fireworks.ai");

		const body = {
			model: this.config.model,
			max_tokens: 4096,
			system: context.system_prompt,
			messages: toAnthropicMessages(context.messages),
			tools: toAnthropicTools(context.tools),
			stream: true,
		};

		const resp = await fetch(`${baseUrl}/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(isFireworks
					? { Authorization: `Bearer ${this.config.apiKey}` }
					: {
							"x-api-key": this.config.apiKey,
							"anthropic-version": "2023-06-01",
						}),
			},
			body: JSON.stringify(body),
			signal: signal ?? null,
		});

		if (!resp.ok) {
			const errorText = await resp.text();
			throw new Error(`Anthropic API error ${resp.status}: ${errorText}`);
		}

		return this.createStream(resp, signal);
	}

	private createStream(resp: Response, signal?: AbortSignal): LlmStream {
		const body = resp.body;
		if (!body) {
			throw new Error("Anthropic response has no body");
		}

		// Accumulated state for building the final LlmResult
		const textBlocks: { type: "text"; text: string }[] = [];
		const toolBlocks: {
			type: "tool_call";
			id: string;
			name: string;
			arguments: unknown;
		}[] = [];
		let stopReason: StopReason = "end_turn";

		// Active tool block being accumulated
		const activeToolBlocks = new Map<
			number,
			{ id: string; name: string; partialJson: string }
		>();

		// Push-queue for async iteration
		const chunkQueue: LlmChunk[] = [];
		let chunkResolve: ((value: IteratorResult<LlmChunk>) => void) | null = null;
		let streamDone = false;

		let resultResolve: ((result: LlmResult) => void) | undefined;
		let resultReject: ((error: Error) => void) | undefined;

		const resultPromise = new Promise<LlmResult>((resolve, reject) => {
			resultResolve = resolve;
			resultReject = reject;
		});

		function enqueue(chunk: LlmChunk): void {
			if (chunkResolve) {
				const resolve = chunkResolve;
				chunkResolve = null;
				resolve({ value: chunk, done: false });
			} else {
				chunkQueue.push(chunk);
			}
		}

		function finishStream(): void {
			streamDone = true;
			if (chunkResolve) {
				const resolve = chunkResolve;
				chunkResolve = null;
				resolve({ value: undefined, done: true });
			}
		}

		// Read SSE in background
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		const readLoop = async (): Promise<void> => {
			try {
				while (true) {
					if (signal?.aborted) {
						resultResolve?.({
							Err: {
								error: {
									code: "aborted",
									message: "Request aborted",
								},
								aborted: true,
							},
						});
						finishStream();
						break;
					}

					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });

					const events = buffer.split("\n\n");
					buffer = events.pop() ?? "";

					for (const event of events) {
						if (!event.trim()) continue;

						let eventType = "";
						let data = "";

						for (const line of event.split("\n")) {
							if (line.startsWith("event:")) {
								eventType = line.slice(6).trim();
							} else if (line.startsWith("data:")) {
								data = line.slice(5).trim();
							}
						}

						if (!eventType || !data) continue;
						if (data === "[DONE]") continue;

						let parsed: unknown;
						try {
							parsed = JSON.parse(data);
						} catch {
							continue;
						}

						if (!isStreamEvent(parsed)) continue;

						switch (parsed.type) {
							case "message_start": {
								enqueue({
									kind: "start",
									content: [],
									api: "anthropic",
									provider: "anthropic",
									model: this.config.model,
									stop_reason: "end_turn",
									timestamp: Date.now(),
									usage: {
										input: 0,
										output: 0,
										cache_read: 0,
										cache_write: 0,
										total_tokens: 0,
									},
								});
								break;
							}
							case "message_stop":
							case "content_block_stop":
								break;

							case "content_block_start": {
								if (parsed.content_block.type === "tool_use") {
									activeToolBlocks.set(parsed.index, {
										id: parsed.content_block.id,
										name: parsed.content_block.name,
										partialJson: "",
									});
								}
								break;
							}

							case "content_block_delta": {
								if (parsed.delta.type === "text_delta") {
									textBlocks.push({
										type: "text",
										text: parsed.delta.text,
									});
									enqueue({
										kind: "text_delta",
										text: parsed.delta.text,
									});
								} else if (parsed.delta.type === "input_json_delta") {
									const block = activeToolBlocks.get(parsed.index);
									if (block) {
										block.partialJson += parsed.delta.partial_json;
										enqueue({
											kind: "tool_call_delta",
											tool_call_id: block.id,
											delta: parsed.delta.partial_json,
										});
									}
								}
								break;
							}

							case "message_delta": {
								stopReason = toStopReason(parsed.delta.stop_reason);
								break;
							}
						}
					}
				}

				// Build final tool_call blocks from accumulated partial JSON
				for (const block of activeToolBlocks.values()) {
					let args: unknown = {};
					if (block.partialJson) {
						try {
							args = JSON.parse(block.partialJson);
						} catch {
							args = {};
						}
					}
					toolBlocks.push({
						type: "tool_call",
						id: block.id,
						name: block.name,
						arguments: args,
					});
				}

				// Merge consecutive text blocks
				const mergedText = textBlocks.map((b) => b.text).join("");
				const content: Content[] = [
					...(mergedText ? [{ type: "text" as const, text: mergedText }] : []),
					...toolBlocks,
				];

				enqueue({ kind: "done" });

				resultResolve?.({
					Ok: {
						content,
						api: "anthropic",
						provider: "anthropic",
						model: this.config.model,
						stop_reason: stopReason,
						timestamp: Date.now(),
						usage: {
							input: 0,
							output: 0,
							cache_read: 0,
							cache_write: 0,
							total_tokens: 0,
						},
					},
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const isAborted =
					err instanceof DOMException && err.name === "AbortError";

				if (isAborted) {
					resultResolve?.({
						Err: {
							error: { code: "aborted", message },
							aborted: true,
						},
					});
				} else {
					enqueue({
						kind: "error",
						message,
					});
					resultReject?.(err instanceof Error ? err : new Error(message));
				}
			} finally {
				finishStream();
				reader.releaseLock();
			}
		};

		// Start reading SSE events in background (fire-and-forget)
		readLoop().catch(() => {
			// Should never happen — errors are handled inside readLoop
		});

		// Build the async iterator for chunks
		const asyncIterator: AsyncGenerator<LlmChunk> = (async function* () {
			while (true) {
				if (chunkQueue.length > 0) {
					const chunk = chunkQueue.shift();
					if (chunk !== undefined) yield chunk;
					continue;
				}
				if (streamDone) return;
				const item = await new Promise<IteratorResult<LlmChunk>>((resolve) => {
					chunkResolve = resolve;
				});
				if (item.done) return;
				yield item.value;
			}
		})();

		return {
			chunks: asyncIterator,
			result: resultPromise,
		};
	}
}
