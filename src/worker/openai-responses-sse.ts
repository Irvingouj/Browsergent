/**
 * SSE parser for the OpenAI Responses API.
 *
 * Events are `event:` + `data:` frames. Text arrives as
 * `response.output_text.delta`. Tool calls arrive as a `function_call` output
 * item, then `response.function_call_arguments.delta` fragments.
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
import {
	encodeAssistantMessage,
	encodeReasoningItem,
	joinToolCallId,
	type ResponsesReasoningItem,
	type StoredAssistantMessage,
} from "./openai-responses-wire";

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ToolAcc {
	toolCallId: string;
	name: string;
	partial: string;
}

function dataPayload(frame: string): string {
	let data = "";
	for (const line of frame.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("data:")) data += trimmed.slice(5).trim();
	}
	return data;
}

function errorMessage(event: Record<string, unknown>): string {
	if (typeof event.message === "string" && event.message) return event.message;
	const response = isRecord(event.response) ? event.response : undefined;
	const error =
		response && isRecord(response.error) ? response.error : undefined;
	if (error && typeof error.message === "string" && error.message) {
		return error.message;
	}
	return "Responses API request failed";
}

export async function readResponsesStreamText(
	body: ReadableStream<Uint8Array>,
): Promise<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
			const frames = buffer.split("\n\n");
			buffer = frames.pop() ?? "";
			for (const frame of frames) {
				const data = dataPayload(frame);
				if (!data || data === "[DONE]") continue;
				try {
					const parsed: unknown = JSON.parse(data);
					if (
						isRecord(parsed) &&
						parsed.type === "response.output_text.delta" &&
						typeof parsed.delta === "string"
					) {
						text += parsed.delta;
					}
				} catch {
					// Ignore a truncated frame; the next chunk completes it.
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
	return text.trim();
}

export function createResponsesStream(
	body: ReadableStream,
	model: string,
	signal?: AbortSignal,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
): LlmStream {
	const textParts: string[] = [];
	const outputParts: Array<
		| { kind: "reasoning"; item: ResponsesReasoningItem }
		| { kind: "message"; message: StoredAssistantMessage }
		| { kind: "text"; text: string }
		| { kind: "tool"; itemId: string }
	> = [];
	let stopReason: StopReason = "end_turn";
	const toolsByItem = new Map<string, ToolAcc>();
	const toolCallNames = new Map<string, string>();

	const chunkQueue: LlmChunk[] = [];
	let chunkResolve: ((value: IteratorResult<LlmChunk>) => void) | null = null;
	let streamDone = false;
	const resultPromise = deferred<LlmResult>();
	let emittedStart = false;

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

	function ensureStart(): void {
		if (emittedStart) return;
		emittedStart = true;
		streamLog("openai.responses_start");
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

	function rememberTool(itemId: string, callId: string, name: string): ToolAcc {
		const existing = toolsByItem.get(itemId);
		if (existing) {
			if (name && !existing.name) existing.name = name;
			return existing;
		}
		const toolCallId = joinToolCallId(
			callId,
			itemId === callId ? undefined : itemId,
		);
		const acc: ToolAcc = { toolCallId, name, partial: "" };
		toolsByItem.set(itemId, acc);
		toolCallNames.set(toolCallId, name);
		return acc;
	}

	function applyArguments(acc: ToolAcc, next: string, replace: boolean): void {
		const previous = acc.partial;
		acc.partial = replace ? next : previous + next;
		const delta = replace
			? next.startsWith(previous)
				? next.slice(previous.length)
				: ""
			: next;
		if (!delta) return;
		ensureStart();
		enqueue({
			kind: "tool_call_delta",
			tool_call_id: acc.toolCallId,
			delta: { type: "string", value: delta },
		});
	}

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const readLoop = async (): Promise<void> => {
		try {
			while (true) {
				if (signal?.aborted) {
					resultPromise.resolve({
						Err: {
							error: { code: "aborted", message: "Request aborted" },
							aborted: true,
						},
					});
					finishStream();
					return;
				}
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder
					.decode(value, { stream: true })
					.replace(/\r\n/g, "\n");
				const frames = buffer.split("\n\n");
				buffer = frames.pop() ?? "";
				for (const frame of frames) {
					const data = dataPayload(frame);
					if (!data || data === "[DONE]") continue;
					onDiagnostic({
						kind: "provider_sse_event",
						timestamp: Date.now(),
						eventType: "response",
						data,
					});
					let parsed: unknown;
					try {
						parsed = JSON.parse(data);
					} catch {
						continue;
					}
					if (!isRecord(parsed) || typeof parsed.type !== "string") continue;
					const type = parsed.type;

					if (type === "error" || type === "response.failed") {
						const message = errorMessage(parsed);
						enqueue({ kind: "error", message });
						resultPromise.resolve({
							Err: {
								error: { code: "api_error", message },
								aborted: false,
							},
						});
						finishStream();
						return;
					}

					if (
						type === "response.output_text.delta" &&
						typeof parsed.delta === "string"
					) {
						ensureStart();
						streamLog("openai.responses_delta", { len: parsed.delta.length });
						textParts.push(parsed.delta);
						enqueue({ kind: "text_delta", text: parsed.delta });
						continue;
					}

					if (type === "response.output_item.added" && isRecord(parsed.item)) {
						const item = parsed.item;
						if (item.type !== "function_call") continue;
						const callId = typeof item.call_id === "string" ? item.call_id : "";
						const itemId = typeof item.id === "string" ? item.id : callId;
						const name = typeof item.name === "string" ? item.name : "";
						if (!callId) continue;
						ensureStart();
						if (
							!outputParts.some(
								(part) => part.kind === "tool" && part.itemId === itemId,
							)
						) {
							outputParts.push({ kind: "tool", itemId });
						}
						const acc = rememberTool(itemId, callId, name);
						if (typeof item.arguments === "string" && item.arguments) {
							applyArguments(acc, item.arguments, false);
						}
						continue;
					}

					if (
						type === "response.function_call_arguments.delta" ||
						type === "response.function_call_arguments.done"
					) {
						const itemId =
							typeof parsed.item_id === "string" ? parsed.item_id : "";
						const acc = itemId ? toolsByItem.get(itemId) : undefined;
						if (!acc) continue;
						const next =
							type === "response.function_call_arguments.done"
								? typeof parsed.arguments === "string"
									? parsed.arguments
									: ""
								: typeof parsed.delta === "string"
									? parsed.delta
									: "";
						applyArguments(
							acc,
							next,
							type === "response.function_call_arguments.done",
						);
						continue;
					}

					if (type === "response.output_item.done" && isRecord(parsed.item)) {
						const item = parsed.item;
						if (
							item.type === "reasoning" &&
							typeof item.id === "string" &&
							item.id.length > 0
						) {
							outputParts.push({
								kind: "reasoning",
								item: item as ResponsesReasoningItem,
							});
							continue;
						}
						if (
							item.type === "message" &&
							typeof item.id === "string" &&
							item.id.length > 0
						) {
							let text = "";
							if (Array.isArray(item.content)) {
								for (const part of item.content) {
									if (!isRecord(part)) continue;
									if (
										part.type === "output_text" &&
										typeof part.text === "string"
									) {
										text += part.text;
									} else if (
										part.type === "refusal" &&
										typeof part.refusal === "string"
									) {
										text += part.refusal;
									}
								}
							}
							outputParts.push({
								kind: "message",
								message: {
									id: item.id,
									text,
									...(typeof item.phase === "string"
										? { phase: item.phase }
										: {}),
								},
							});
							continue;
						}
					}

					if (
						type === "response.completed" ||
						type === "response.incomplete" ||
						type === "response.done"
					) {
						const response = isRecord(parsed.response)
							? parsed.response
							: undefined;
						const status =
							response && typeof response.status === "string"
								? response.status
								: "";
						if (status === "incomplete") stopReason = "max_tokens";
						else if (status === "failed" || status === "cancelled")
							stopReason = "error";
					}
				}
			}

			if (toolsByItem.size > 0 && stopReason === "end_turn") {
				stopReason = "tool_use";
			}
			const seenTools = new Set(
				outputParts.flatMap((part) =>
					part.kind === "tool" ? [part.itemId] : [],
				),
			);
			for (const itemId of toolsByItem.keys()) {
				if (!seenTools.has(itemId)) {
					outputParts.push({ kind: "tool", itemId });
				}
			}
			const mergedText = textParts.join("");
			const messageParts = outputParts.filter(
				(part) => part.kind === "message",
			);
			if (
				messageParts.length === 1 &&
				messageParts[0]?.kind === "message" &&
				messageParts[0].message.text === "" &&
				mergedText
			) {
				messageParts[0].message.text = mergedText;
			}
			if (
				messageParts.length === 0 &&
				mergedText &&
				!outputParts.some((part) => part.kind === "message")
			) {
				const toolAt = outputParts.findIndex((part) => part.kind === "tool");
				const plain = {
					kind: "text" as const,
					text: mergedText,
				};
				if (toolAt === -1) outputParts.push(plain);
				else outputParts.splice(toolAt, 0, plain);
			}
			const content: Content[] = [];
			for (const part of outputParts) {
				if (part.kind === "reasoning") {
					content.push({
						type: "text",
						text: encodeReasoningItem(part.item),
					});
					continue;
				}
				if (part.kind === "message") {
					content.push({
						type: "text",
						text: encodeAssistantMessage(part.message),
					});
					continue;
				}
				if (part.kind === "text") {
					content.push({ type: "text", text: part.text });
					continue;
				}
				const acc = toolsByItem.get(part.itemId);
				if (!acc) continue;
				let args: unknown = {};
				if (acc.partial) {
					try {
						args = JSON.parse(acc.partial);
					} catch {
						args = {};
					}
				}
				content.push({
					type: "tool_call",
					id: acc.toolCallId,
					name: acc.name,
					arguments: args,
				});
			}
			resultPromise.resolve({
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
			enqueue({ kind: "done" });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const isAborted =
				err instanceof DOMException && err.name === "AbortError";
			if (isAborted) {
				resultPromise.resolve({
					Err: {
						error: { code: "aborted", message },
						aborted: true,
					},
				});
			} else {
				enqueue({ kind: "error", message });
				resultPromise.reject(err instanceof Error ? err : new Error(message));
			}
		} finally {
			finishStream();
			reader.releaseLock();
		}
	};

	readLoop().catch(() => {
		// Errors are handled inside readLoop.
	});

	const asyncIterator: AsyncGenerator<LlmChunk> = (async function* () {
		while (true) {
			if (chunkQueue.length > 0) {
				const chunk = chunkQueue.shift();
				if (chunk !== undefined) yield chunk;
				continue;
			}
			if (streamDone) return;
			const { promise, resolve } = deferred<IteratorResult<LlmChunk>>();
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
