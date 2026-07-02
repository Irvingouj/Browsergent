/**
 * Provider dispatcher — picks the right model factory by wire format.
 */

import type { AgentModel } from "@pi-oxide/pi-host-web";
import type { AgentDiagnosticEvent } from "../types/messages";
import { WireFormat } from "../types/messages";
import type { AnthropicConfig } from "./anthropic";
import { createAnthropicModel } from "./anthropic-model";
import type { OpenAIConfig } from "./openai";
import { createOpenAIModel } from "./openai-model";

export interface RuntimeProvider {
	wireFormat: WireFormat;
	apiKey: string;
	chatEndpointUrl: string;
	model: string;
}

export function createProviderModel(
	provider: RuntimeProvider,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
): AgentModel {
	switch (provider.wireFormat) {
		case WireFormat.AnthropicMessages: {
			const config: AnthropicConfig = {
				apiKey: provider.apiKey,
				chatEndpointUrl: provider.chatEndpointUrl,
				model: provider.model,
			};
			return createAnthropicModel(config, onDiagnostic);
		}
		case WireFormat.OpenAIChatCompletions: {
			const config: OpenAIConfig = {
				apiKey: provider.apiKey,
				chatEndpointUrl: provider.chatEndpointUrl,
				model: provider.model,
			};
			return createOpenAIModel(config, onDiagnostic);
		}
	}
}
