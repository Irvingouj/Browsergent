import type {
	AgentModel,
	ModelEvent,
	ModelRequest,
	ModelResponse,
} from "@pi-oxide/pi-host-web";
import { defineModel } from "@pi-oxide/pi-host-web";
import type { Content } from "@pi-oxide/pi-host-web/raw";
import type {
	AgentDiagnosticEvent,
	DiagnosticMessage,
} from "../types/messages";
import { streamLog } from "../utils/stream-logger";
import type { AnthropicConfig } from "./anthropic";
import { AnthropicProvider } from "./anthropic";
import type { LlmStream } from "./llm-streamer";
import { sdkToolToWasmTool, sdkToWasmMessages } from "./sdk-message-conversion";

type DiagnosticSink = (event: AgentDiagnosticEvent) => void;

function toolDeltaText(delta: Record<string, unknown>): string {
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

export function createAnthropicModel(
	config: AnthropicConfig,
	onDiagnostic: DiagnosticSink = () => {},
): AgentModel {
	const provider = new AnthropicProvider(config, onDiagnostic);

	return defineModel({
		id: config.model,
		contextWindow: 200_000,
		maxTokens: 4096,
		generate: async (request: ModelRequest): Promise<ModelResponse> => {
			recordRequest(request, onDiagnostic);
			const context = {
				system_prompt: request.instructions,
				messages: sdkToWasmMessages(request.messages),
				tools: sdkToolToWasmTool(request.tools),
			};
			const stream = await provider.call(context, request.signal);
			const response = await drainStreamToResponse(stream);
			onDiagnostic({
				kind: "model_response",
				timestamp: Date.now(),
				providerStopReason: response.rawProviderStopReason,
				sdkStopReason: response.response.stopReason,
				content: response.response.content,
			});
			return response.response;
		},
		generateStream: async function* (
			request: ModelRequest,
			signal?: AbortSignal,
		): AsyncGenerator<ModelEvent> {
			recordRequest(request, onDiagnostic);
			const context = {
				system_prompt: request.instructions,
				messages: sdkToWasmMessages(request.messages),
				tools: sdkToolToWasmTool(request.tools),
			};
			const stream = await provider.call(context, signal);

			for await (const chunk of stream.chunks) {
				if (signal?.aborted) return;

				switch (chunk.kind) {
					case "start":
						yield { type: "start", payload: chunk };
						break;
					case "text_delta":
						streamLog("model.yield_delta", { len: chunk.text.length });
						yield { type: "text_delta", payload: chunk.text };
						break;
					case "tool_call_delta":
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
						}
						return;
					}
					case "error":
						onDiagnostic({
							kind: "model_response",
							timestamp: Date.now(),
							providerStopReason: "stream_error",
							sdkStopReason: "error",
							content: [],
						});
						yield {
							type: "done",
							payload: {
								content: [],
								stopReason: "error" as const,
							},
						};
						return;
				}
			}
		},
		summarize: async (messages, signal) => {
			const context = {
				system_prompt:
					"Summarize the following conversation context concisely. Preserve key facts, decisions, and action items.",
				messages: sdkToWasmMessages(messages),
				tools: [],
			};
			const stream = await provider.call(context, signal);
			let text = "";
			for await (const chunk of stream.chunks) {
				if (chunk.kind === "text_delta") text += chunk.text;
			}
			return text || "[Context summarized]";
		},
	});
}

async function drainStreamToResponse(
	stream: LlmStream,
): Promise<{ response: ModelResponse; rawProviderStopReason: string }> {
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
		return {
			response: { content: [], stopReason: "error" },
			rawProviderStopReason: result.Err.error.code,
		};
	}

	// If the streaming path accumulated tool-call deltas that were not
	// captured in the final result, merge them in.
	const merged = result.Ok;
	if (toolCalls.length > 0) {
		const seenIds = new Set(
			merged.content.map((b) =>
				b.type === "tool_call" && "id" in b ? b.id : null,
			),
		);
		for (const tc of toolCalls) {
			if (!seenIds.has(tc.id)) {
				merged.content.push(tc as Content);
			}
		}
	}
	return {
		response: wasmToSdkResponse(merged),
		rawProviderStopReason: merged.stop_reason,
	};
}

function wasmToSdkResponse(msg: {
	content: Content[];
	stop_reason: string;
	model?: string;
}): ModelResponse {
	const content: import("@pi-oxide/pi-host-web").AgentContentBlock[] = [];
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
