/**
 * Shared LLM model factory — wires any LlmStreamer (Anthropic, OpenAI, …)
 * into a pi-host-web AgentModel via defineModel(). Provider-specific HTTP/SSE
 * lives in the streamer; this module owns the request/response shaping and
 * the generate/generateStream/summarize contract the SDK expects.
 */

import type {
	AgentContentBlock,
	AgentMessage,
	AgentModel,
	ModelEvent,
	ModelRequest,
	ModelResponse,
} from "@pi-oxide/pi-host-web";
import { defineModel } from "@pi-oxide/pi-host-web";
import type { Content, LlmContext } from "@pi-oxide/pi-host-web/raw";
import type {
	AgentDiagnosticEvent,
	DiagnosticMessage,
} from "../types/messages";
import { streamLog } from "../utils/stream-logger";
import {
	extractiveSummary,
	packSummaryChunks,
	SUMMARY_ATTEMPTS,
	summaryBlocks,
	summaryUserText,
} from "./compaction-summary";
import type { LlmStream } from "./llm-streamer";
import { OutboundTiering } from "./model-context";
import { sdkToolToWasmTool, sdkToWasmMessages } from "./sdk-message-conversion";

type DiagnosticSink = (event: AgentDiagnosticEvent) => void;

const COMPACTION_INSTRUCTIONS = [
	"Summarize this browser-agent conversation so another model can continue the task.",
	"Use these sections: Goal, User constraints (verbatim), External side effects already performed, Current browser state, Progress, Key decisions, Next steps, Artifact paths worth reopening.",
	"Include external side effects already performed: URLs submitted, forms sent, and accounts touched. They must never be redone.",
	"Keep user constraints word for word. Do not invent missing details.",
	"Return only the summary text, at most 3000 tokens.",
].join(" ");

export interface LlmStreamerLike {
	call(context: LlmContext, signal?: AbortSignal): Promise<LlmStream>;
}

export interface CreateModelOptions {
	id: string;
	contextWindow: number;
	maxTokens: number;
	/** True while summarize is in flight, including when it fails or is cancelled. */
	onCompaction?: (active: boolean) => void;
	onCompacted?: (notice: {
		summary: string;
		messageCount: number;
		extractive: boolean;
	}) => void;
}

export function toolDeltaText(delta: Record<string, unknown>): string {
	return delta.type === "string" && typeof delta.value === "string"
		? delta.value
		: JSON.stringify(delta);
}

function diagnosticMessages(
	messages: ModelRequest["messages"],
): DiagnosticMessage[] {
	return messages.map((message) => ({
		id: message.id,
		role: message.role,
		content: message.content,
		timestamp: message.timestamp,
		toolCallId: message.tool_call_id,
	}));
}

function recordRequest(
	request: ModelRequest,
	onDiagnostic: DiagnosticSink,
): void {
	onDiagnostic({
		kind: "model_request",
		timestamp: Date.now(),
		instructions: request.instructions,
		messages: diagnosticMessages(request.messages),
		tools: request.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema,
		})),
	});
}

function cancelledSummary(): DOMException {
	return new DOMException("Summary request was cancelled", "AbortError");
}

function providerFailure(result: Awaited<LlmStream["result"]>): {
	code: string;
	message: string;
	aborted: boolean;
} | null {
	if (!("Err" in result)) return null;
	const error = result.Err.error;
	return {
		code: typeof error.code === "string" ? error.code : "error",
		message: typeof error.message === "string" ? error.message : "",
		aborted: result.Err.aborted === true,
	};
}

async function drainStreamToResponse(stream: LlmStream): Promise<{
	response: ModelResponse;
	rawProviderStopReason: string;
	providerErrorMessage: string;
	aborted: boolean;
}> {
	let _text = "";
	const toolCalls: {
		type: "tool_call";
		id: string;
		name: string;
		arguments: unknown;
	}[] = [];

	for await (const chunk of stream.chunks) {
		switch (chunk.kind) {
			case "text_delta":
				_text += chunk.text;
				break;
			case "tool_call_delta":
				toolCalls.push({
					type: "tool_call",
					id: chunk.tool_call_id,
					name: stream.resolveToolName?.(chunk.tool_call_id) ?? "",
					arguments: toolDeltaText(chunk.delta),
				});
				break;
		}
	}

	const result = await stream.result;
	if ("Err" in result) {
		const failure = providerFailure(result);
		return {
			response: { content: [], stopReason: "error" },
			rawProviderStopReason: failure?.code ?? "error",
			providerErrorMessage: failure?.message ?? "",
			aborted: failure?.aborted ?? false,
		};
	}

	// Merge in tool-call deltas the final result didn't capture.
	const merged = result.Ok;
	if (toolCalls.length > 0) {
		const seenIds = new Set(
			merged.content.map((b) =>
				b.type === "tool_call" && "id" in b ? b.id : null,
			),
		);
		for (const tc of toolCalls) {
			if (!seenIds.has(tc.id)) {
				merged.content.push(tc);
			}
		}
	}
	return {
		response: wasmToSdkResponse(merged),
		rawProviderStopReason: merged.stop_reason,
		providerErrorMessage: "",
		aborted: false,
	};
}

function wasmToSdkResponse(msg: {
	content: Content[];
	stop_reason: string;
	model?: string;
}): ModelResponse {
	const content: AgentContentBlock[] = [];
	for (const block of msg.content) {
		switch (block.type) {
			case "text":
				content.push({ type: "text", text: block.text });
				break;
			case "tool_call":
				content.push({
					type: "tool_call",
					id: block.id,
					name: block.name,
					arguments: block.arguments,
				});
				break;
		}
	}

	return {
		content,
		stopReason:
			msg.stop_reason === "tool_use"
				? "tool_call"
				: msg.stop_reason === "max_tokens"
					? "length"
					: msg.stop_reason === "error"
						? "error"
						: "end",
		model: msg.model,
	};
}

function failureText(code: string, message: string): string {
	return message ? `${code}: ${message}` : code;
}

async function summarizeAttempt(
	streamer: LlmStreamerLike,
	messages: AgentMessage[],
	toolResultChars: number,
	chunkChars: number,
	signal?: AbortSignal,
): Promise<{ summary?: string; failure: string; aborted: boolean }> {
	const chunks = packSummaryChunks(
		summaryBlocks(messages, toolResultChars),
		chunkChars,
	);
	let summary = "";
	for (const chunk of chunks) {
		if (signal?.aborted) return { failure: "", aborted: true };
		let stream: LlmStream;
		try {
			stream = await streamer.call(
				{
					system_prompt: COMPACTION_INSTRUCTIONS,
					messages: sdkToWasmMessages([
						{
							id: "compaction-summary",
							role: "user",
							content: [
								{
									type: "text",
									text: summaryUserText(chunk, summary || undefined),
								},
							],
							timestamp: Date.now(),
						},
					]),
					tools: [],
				},
				signal,
			);
		} catch (error: unknown) {
			if (signal?.aborted) return { failure: "", aborted: true };
			const message = error instanceof Error ? error.message : String(error);
			return { failure: message, aborted: false };
		}
		const result = await drainStreamToResponse(stream);
		if (signal?.aborted || result.aborted) {
			return { failure: "", aborted: true };
		}
		if (result.response.stopReason === "error") {
			return {
				failure: failureText(
					result.rawProviderStopReason,
					result.providerErrorMessage,
				),
				aborted: false,
			};
		}
		const text = result.response.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n")
			.trim();
		if (!text)
			return { failure: "Summary model returned no text", aborted: false };
		summary = text;
	}
	return { summary, failure: "", aborted: false };
}

function isContextOverflowText(text: string): boolean {
	return /context_length_exceeded|exceeds the context window|prompt is too long|maximum context length/i.test(
		text,
	);
}

function contextOverflowResult(result: Awaited<LlmStream["result"]>): boolean {
	const failure = providerFailure(result);
	if (!failure || failure.aborted) return false;
	return isContextOverflowText(`${failure.code} ${failure.message}`);
}

function contextTokenBudget(opts: CreateModelOptions): number {
	return Math.max(1, opts.contextWindow - opts.maxTokens);
}

export function createLlmModel(
	streamer: LlmStreamerLike,
	opts: CreateModelOptions,
	onDiagnostic: DiagnosticSink = () => {},
): AgentModel {
	const tiering = new OutboundTiering();
	const budgetTokens = contextTokenBudget(opts);

	async function callTiered(
		request: ModelRequest,
		signal: AbortSignal | undefined,
		recentFull: number,
		fraction: number,
	) {
		const messages = tiering.prepare(request.messages, {
			maxContextTokens: budgetTokens,
			recentFull,
			fraction,
		});
		recordRequest({ ...request, messages }, onDiagnostic);
		const context = {
			system_prompt: request.instructions,
			messages: sdkToWasmMessages(messages),
			tools: sdkToolToWasmTool(request.tools),
		};
		const stream = await streamer.call(context, signal);
		return { stream, messages };
	}

	return defineModel({
		id: opts.id,
		contextWindow: opts.contextWindow,
		maxTokens: opts.maxTokens,
		generate: async (request: ModelRequest): Promise<ModelResponse> => {
			let recentFull = 3;
			let fraction = 0.7;
			for (let attempt = 0; attempt < 2; attempt++) {
				const { stream } = await callTiered(
					request,
					request.signal,
					recentFull,
					fraction,
				);
				const response = await drainStreamToResponse(stream);
				const overflow = isContextOverflowText(
					`${response.rawProviderStopReason} ${response.providerErrorMessage}`,
				);
				if (overflow && attempt === 0) {
					recentFull = 1;
					fraction = 0.5;
					continue;
				}
				onDiagnostic({
					kind: "model_response",
					timestamp: Date.now(),
					providerStopReason: response.rawProviderStopReason,
					sdkStopReason: response.response.stopReason,
					content: response.response.content,
				});
				return response.response;
			}
			return { content: [], stopReason: "error" };
		},
		summarize: async (
			messages: AgentMessage[],
			signal?: AbortSignal,
		): Promise<string> => {
			if (signal?.aborted) throw cancelledSummary();
			opts.onCompaction?.(true);
			try {
				let lastFailure = "";
				for (const attempt of SUMMARY_ATTEMPTS) {
					const outcome = await summarizeAttempt(
						streamer,
						messages,
						attempt.toolResultChars,
						attempt.chunkChars,
						signal,
					);
					if (outcome.aborted) throw cancelledSummary();
					if (outcome.summary) {
						opts.onCompacted?.({
							summary: outcome.summary,
							messageCount: messages.length,
							extractive: false,
						});
						return outcome.summary;
					}
					lastFailure = outcome.failure;
				}
				const extract = extractiveSummary(messages, lastFailure);
				opts.onCompacted?.({
					summary: extract,
					messageCount: messages.length,
					extractive: true,
				});
				return extract;
			} finally {
				opts.onCompaction?.(false);
			}
		},
		generateStream: async function* (
			request: ModelRequest,
			signal?: AbortSignal,
		): AsyncGenerator<ModelEvent> {
			let recentFull = 3;
			let fraction = 0.7;
			for (let attempt = 0; attempt < 2; attempt++) {
				const { stream } = await callTiered(
					request,
					signal,
					recentFull,
					fraction,
				);
				let yielded = false;
				let retry = false;
				for await (const chunk of stream.chunks) {
					if (signal?.aborted) return;
					switch (chunk.kind) {
						case "start":
							yield { type: "start", payload: chunk };
							break;
						case "text_delta":
							yielded = true;
							streamLog("model.yield_delta", { len: chunk.text.length });
							yield { type: "text_delta", payload: chunk.text };
							break;
						case "tool_call_delta":
							yielded = true;
							yield {
								type: "tool_call_delta",
								payload: {
									id: chunk.tool_call_id,
									name: stream.resolveToolName?.(chunk.tool_call_id) ?? "",
									arguments: toolDeltaText(chunk.delta),
								},
							};
							break;
						case "done": {
							const result = await stream.result;
							const overflow = contextOverflowResult(result);
							if (!yielded && attempt === 0 && overflow) {
								recentFull = 1;
								fraction = 0.5;
								retry = true;
								break;
							}
							if ("Ok" in result) {
								const response = wasmToSdkResponse(result.Ok);
								onDiagnostic({
									kind: "model_response",
									timestamp: Date.now(),
									providerStopReason: result.Ok.stop_reason,
									sdkStopReason: response.stopReason,
									content: response.content,
								});
								yield { type: "done", payload: response };
							} else if ("Err" in result) {
								const failure = providerFailure(result);
								onDiagnostic({
									kind: "model_response",
									timestamp: Date.now(),
									providerStopReason: failure?.code ?? "error",
									sdkStopReason: "error",
									content: [],
								});
								yield {
									type: "done",
									payload: { content: [], stopReason: "error" as const },
								};
							}
							return;
						}
						case "error": {
							if (
								!yielded &&
								attempt === 0 &&
								isContextOverflowText(chunk.message)
							) {
								recentFull = 1;
								fraction = 0.5;
								retry = true;
								break;
							}
							onDiagnostic({
								kind: "model_response",
								timestamp: Date.now(),
								providerStopReason: `stream_error: ${chunk.message}`,
								sdkStopReason: "error",
								content: [],
							});
							yield {
								type: "done",
								payload: { content: [], stopReason: "error" as const },
							};
							return;
						}
					}
					if (retry) break;
				}
				if (retry) continue;
				const settled = await stream.result;
				const overflow = contextOverflowResult(settled);
				if (!yielded && attempt === 0 && overflow) {
					recentFull = 1;
					fraction = 0.5;
					continue;
				}
				if ("Ok" in settled) {
					const response = wasmToSdkResponse(settled.Ok);
					yield { type: "done", payload: response };
				} else if ("Err" in settled) {
					yield {
						type: "done",
						payload: { content: [], stopReason: "error" as const },
					};
				}
				return;
			}
		},
	});
}
