/**
 * Anthropic model — thin wrapper around the shared createLlmModel factory.
 * Provider-specific HTTP/SSE lives in ./anthropic.ts; this module just adapts
 * an AnthropicProvider into the LlmStreamerLike contract the factory expects.
 */

import type { AgentModel } from "@pi-oxide/pi-host-web";
import type { AgentDiagnosticEvent } from "../types/messages";
import { type AnthropicConfig, AnthropicProvider } from "./anthropic";
import { createLlmModel } from "./llm-model";

export function createAnthropicModel(
	config: AnthropicConfig,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
	onCompaction?: (active: boolean) => void,
	onCompacted?: (notice: {
		summary: string;
		messageCount: number;
		extractive: boolean;
	}) => void,
): AgentModel {
	const provider = new AnthropicProvider(config, onDiagnostic);
	return createLlmModel(
		provider,
		{
			id: config.model,
			contextWindow: 200_000,
			maxTokens: 4096,
			onCompaction,
			onCompacted,
		},
		onDiagnostic,
	);
}
