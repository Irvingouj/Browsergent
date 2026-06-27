/**
 * OpenAI-compatible model — thin wrapper around the shared createLlmModel
 * factory. Provider-specific HTTP/SSE lives in ./openai.ts.
 */

import type { AgentModel } from "@pi-oxide/pi-host-web";
import type { AgentDiagnosticEvent } from "../types/messages";
import { createLlmModel } from "./llm-model";
import { type OpenAIConfig, OpenAIProvider } from "./openai";

export function createOpenAIModel(
	config: OpenAIConfig,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
): AgentModel {
	const provider = new OpenAIProvider(config, onDiagnostic);
	return createLlmModel(
		provider,
		{ id: config.model, contextWindow: 128_000, maxTokens: 4096 },
		onDiagnostic,
	);
}
