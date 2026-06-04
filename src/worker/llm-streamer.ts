import type {
	LlmChunk,
	LlmContext,
	LlmResult,
} from "@pi-oxide/pi-host-web/raw";

/**
 * Replaces the old SDK's LlmStream type.
 * The LLM provider yields chunks and resolves to a final result.
 */
export interface LlmStream {
	chunks: AsyncGenerator<LlmChunk>;
	result: Promise<LlmResult>;
}

/**
 * Replaces the old SDK's LlmProvider interface.
 * A standalone function that streams an LLM response for the given context.
 */
export type LlmStreamer = (
	context: LlmContext,
	signal?: AbortSignal,
) => Promise<LlmStream>;
