/**
 * Responses-API model. HTTP and SSE live in ./openai-responses.ts.
 */

import type { AgentModel } from "@pi-oxide/pi-host-web";
import type { AgentDiagnosticEvent } from "../types/messages";
import { createLlmModel } from "./llm-model";
import {
	type OpenAIResponsesConfig,
	OpenAIResponsesProvider,
} from "./openai-responses";

export function createOpenAIResponsesModel(
	config: OpenAIResponsesConfig,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
	onCompaction?: (active: boolean) => void,
	onCompacted?: (notice: {
		summary: string;
		messageCount: number;
		extractive: boolean;
	}) => void,
): AgentModel {
	const provider = new OpenAIResponsesProvider(config, onDiagnostic);
	const codex = Boolean(config.codexAccountId);
	return createLlmModel(
		provider,
		{
			id: config.model,
			contextWindow: codex ? 272_000 : 128_000,
			maxTokens: 4096,
			onCompaction,
			onCompacted,
		},
		onDiagnostic,
	);
}
