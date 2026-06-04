import type {
	AgentModel,
	ModelEvent,
	ModelRequest,
	ModelResponse,
} from "@pi-oxide/pi-host-web";
import { defineModel } from "@pi-oxide/pi-host-web";
import type { Content } from "@pi-oxide/pi-host-web/raw";
import { streamLog } from "../utils/stream-logger";
import type { AnthropicConfig } from "./anthropic";
import { AnthropicProvider } from "./anthropic";
import type { LlmStream } from "./llm-streamer";
import { sdkToolToWasmTool, sdkToWasmMessages } from "./sdk-message-conversion";

export function createAnthropicModel(config: AnthropicConfig): AgentModel {
	const provider = new AnthropicProvider(config);

	return defineModel({
		id: config.model,
		contextWindow: 200_000,
		maxTokens: 4096,
		generate: async (request: ModelRequest): Promise<ModelResponse> => {
			const context = {
				system_prompt: request.instructions,
				messages: sdkToWasmMessages(request.messages),
				tools: sdkToolToWasmTool(request.tools),
			};
			const stream = await provider.call(context, request.signal);
			return drainStreamToResponse(stream);
		},
		generateStream: async function* (
			request: ModelRequest,
			signal?: AbortSignal,
		): AsyncGenerator<ModelEvent> {
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
								name: "",
								arguments:
									typeof chunk.delta === "string"
										? chunk.delta
										: JSON.stringify(chunk.delta),
							},
						};
						break;
					case "done": {
						const result = await stream.result;
						if ("Ok" in result) {
							yield { type: "done", payload: wasmToSdkResponse(result.Ok) };
						}
						return;
					}
					case "error":
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
): Promise<ModelResponse> {
	let _text = "";
	const toolCalls: import("@pi-oxide/pi-host-web").AgentContentBlock[] = [];

	for await (const chunk of stream.chunks) {
		switch (chunk.kind) {
			case "text_delta":
				_text += chunk.text;
				break;
			case "tool_call_delta":
				toolCalls.push({
					type: "tool_call",
					id: chunk.tool_call_id,
					name: "",
					arguments:
						typeof chunk.delta === "string" ? chunk.delta : chunk.delta,
				});
				break;
		}
	}

	const result = await stream.result;
	if ("Err" in result) {
		return {
			content: [],
			stopReason: "error",
		};
	}

	return wasmToSdkResponse(result.Ok);
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
