/**
 * SSE streaming logic for OpenAI Chat Completions.
 *
 * Mirrors anthropic-sse structure but parses `data: <chunk>` lines (no
 * `event:` typing). Tool-call deltas are accumulated by `delta.tool_calls[].index`:
 * the first delta for an index carries id+function.name, subsequent deltas carry
 * function.arguments string fragments that concatenate then JSON.parse once.
 */

import type {
	Content,
	LlmChunk,
	LlmResult,
	StopReason,
} from "@pi-oxide/pi-host-web/raw";
import type { AgentDiagnosticEvent } from "../types/messages";
import { streamLog } from "../utils/stream-logger";
import type { LlmStream } from "./llm-streamer";
import { isOpenAIStreamChunk } from "./openai-types";
import { toStopReason } from "./openai-wire";

export function createOpenAIStream(
	body: ReadableStream,
	model: string,
	signal?: AbortSignal,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
): LlmStream {
	const textParts: string[] = [];
	const toolBlocks: {
		type: "tool_call";
		id: string;
		name: string;
		arguments: unknown;
	}[] = [];
	let stopReason: StopReason = "end_turn";

	// index → accumulating tool call
	const activeToolBlocks = new Map<
		number,
		{ id: string; name: string; partialJson: string }
	>();
	const toolCallNames = new Map<string, string>();

	const chunkQueue: LlmChunk[] = [];
	let chunkResolve: ((value: IteratorResult<LlmChunk>) => void) | null = null;
	let streamDone = false;

	const resultPromise = Promise.withResolvers<LlmResult>();
	const resultResolve = resultPromise.resolve;
	const resultReject = resultPromise.reject;

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

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let emittedStart = false;

	const readLoop = async (): Promise<void> => {
		try {
			while (true) {
				if (signal?.aborted) {
					resultResolve?.({
						Err: {
							error: { code: "aborted", message: "Request aborted" },
							aborted: true,
						},
					});
					finishStream();
					break;
				}

				const { done, value } = await reader.read();
				if (done) {
					streamLog("openai.sse_done");
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				// SSE frames are separated by a blank line.
				const frames = buffer.split("\n\n");
				buffer = frames.pop() ?? "";

				for (const frame of frames) {
					if (!frame.trim()) continue;

					// OpenAI sends only `data:` lines (no `event:` typing).
					let data = "";
					for (const line of frame.split("\n")) {
						const trimmed = line.trim();
						if (trimmed.startsWith("data:")) {
							data += trimmed.slice(5).trim();
						}
					}
					if (!data) continue;

					onDiagnostic({
						kind: "provider_sse_event",
						timestamp: Date.now(),
						eventType: "chat.completion.chunk",
						data,
					});
					if (data === "[DONE]") continue;

					let parsed: unknown;
					try {
						parsed = JSON.parse(data);
					} catch {
						continue;
					}
					if (!isOpenAIStreamChunk(parsed)) continue;

					const choice = parsed.choices[0];
					if (choice) {
						if (!emittedStart) {
							emittedStart = true;
							streamLog("openai.sse_start");
							enqueue({
								kind: "start",
								content: [],
								api: "openai",
								provider: "openai",
								model,
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
						}

						const delta = choice.delta;
						if (typeof delta.content === "string" && delta.content) {
							streamLog("openai.sse_delta", { len: delta.content.length });
							textParts.push(delta.content);
							enqueue({ kind: "text_delta", text: delta.content });
						}

						if (delta.tool_calls) {
							for (const tc of delta.tool_calls) {
								let block = activeToolBlocks.get(tc.index);
								if (!block) {
									// First delta for this index carries id + name.
									const id = tc.id ?? `call_${tc.index}`;
									const name = tc.function?.name ?? "";
									block = { id, name, partialJson: "" };
									activeToolBlocks.set(tc.index, block);
									toolCallNames.set(id, name);
								}
								if (tc.id && block.id !== tc.id) {
									toolCallNames.delete(block.id);
									block.id = tc.id;
									toolCallNames.set(tc.id, block.name);
								}
								if (tc.function?.name && !block.name) {
									block.name = tc.function.name;
									toolCallNames.set(block.id, block.name);
								}
								const frag = tc.function?.arguments ?? "";
								if (frag) {
									block.partialJson += frag;
									enqueue({
										kind: "tool_call_delta",
										tool_call_id: block.id,
										delta: { type: "string", value: frag },
									});
								}
							}
						}

						if (choice.finish_reason) {
							stopReason = toStopReason(choice.finish_reason);
						}
					}
				}
			}

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

			const mergedText = textParts.join("");
			const content: Content[] = [
				...(mergedText ? [{ type: "text" as const, text: mergedText }] : []),
				...toolBlocks,
			];

			enqueue({ kind: "done" });

			resultResolve?.({
				Ok: {
					content,
					api: "openai",
					provider: "openai",
					model,
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
				enqueue({ kind: "error", message });
				resultReject?.(err instanceof Error ? err : new Error(message));
			}
		} finally {
			finishStream();
			reader.releaseLock();
		}
	};

	readLoop().catch(() => {
		// Should never happen — errors are handled inside readLoop
	});

	const asyncIterator: AsyncGenerator<LlmChunk> = (async function* () {
		while (true) {
			if (chunkQueue.length > 0) {
				const chunk = chunkQueue.shift();
				if (chunk !== undefined) yield chunk;
				continue;
			}
			if (streamDone) return;
			const { promise, resolve } =
				Promise.withResolvers<IteratorResult<LlmChunk>>();
			chunkResolve = resolve;
			const item = await promise;
			if (item.done) return;
			yield item.value;
		}
	})();

	return {
		chunks: asyncIterator,
		result: resultPromise.promise,
		resolveToolName: (toolCallId: string) => toolCallNames.get(toolCallId),
	};
}
