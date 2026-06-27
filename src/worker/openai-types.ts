/**
 * OpenAI Chat Completions wire-format types — never exported beyond the worker folder.
 * Applies to OpenAI and any OpenAI-compatible endpoint (DeepSeek, OpenRouter, Groq,
 * Together, vLLM, Ollama, LM Studio, Fireworks-openai, etc.).
 */

export interface OpenAIToolFunction {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
}

export interface OpenAIToolDefinition {
	type: "function";
	function: OpenAIToolFunction;
}

export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | null;
	name?: string;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

/** Request body for POST /v1/chat/completions (streaming). */
export interface OpenAIRequestBody {
	model: string;
	messages: OpenAIMessage[];
	tools?: OpenAIToolDefinition[];
	stream: boolean;
	max_tokens?: number;
}

/**
 * One streamed chunk: `data: {...}`. `choices[0].delta` carries incremental
 * content/tool_calls; `choices[0].finish_reason` is set on the final content
 * chunk. With `stream_options.include_usage` the last chunk has empty choices.
 */
export interface OpenAIStreamChunk {
	id: string;
	object: "chat.completion.chunk";
	choices: Array<{
		index: number;
		delta: {
			role?: string;
			content?: string | null;
			tool_calls?: OpenAIDeltaToolCall[];
		};
		finish_reason?: string | null;
	}>;
}

/** A tool-call delta: index keys the call; id/name arrive in the first chunk. */
export interface OpenAIDeltaToolCall {
	index: number;
	id?: string;
	type?: "function";
	function?: { name?: string; arguments?: string };
}

export function isOpenAIStreamChunk(
	value: unknown,
): value is OpenAIStreamChunk {
	return (
		typeof value === "object" &&
		value !== null &&
		"object" in value &&
		value.object === "chat.completion.chunk" &&
		"choices" in value &&
		Array.isArray(value.choices)
	);
}
