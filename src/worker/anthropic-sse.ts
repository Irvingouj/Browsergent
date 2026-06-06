/**
 * SSE streaming logic for Anthropic.
 *
 * Parses Server-Sent Events from a ReadableStream, converts them into LlmChunk
 * values via a push-queue async generator, and builds the final LlmResult.
 */

import type {
	Content,
	LlmChunk,
	LlmResult,
	StopReason,
} from "@pi-oxide/pi-host-web/raw";
import { streamLog } from "../utils/stream-logger";
import { isStreamEvent } from "./anthropic-types";
import { toStopReason } from "./anthropic-wire";
import type { LlmStream } from "./llm-streamer";

export function createAnthropicStream(
	body: ReadableStream,
	model: string,
	signal?: AbortSignal,
): LlmStream {
	const textBlocks: { type: "text"; text: string }[] = [];
	const toolBlocks: {
		type: "tool_call";
		id: string;
		name: string;
		arguments: unknown;
	}[] = [];
	let stopReason: StopReason = "end_turn";

	const activeToolBlocks = new Map<
		number,
		{ id: string; name: string; partialJson: string }
	>();

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
				if (done) {
					streamLog("anthropic.sse_done");
					break;
				}

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
							streamLog("anthropic.sse_start");
							enqueue({
								kind: "start",
								content: [],
								api: "anthropic",
								provider: "anthropic",
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
								streamLog("anthropic.sse_delta", {
									len: parsed.delta.text.length,
									text: parsed.delta.text.slice(0, 30),
								});
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
