/**
 * Provider dispatcher — picks the right model factory by wire kind.
 *
 * RuntimeProvider is the minimal config the worker needs; the full editable
 * ProviderConfig (id, name, …) lives in src/state/slices/settings-slice and
 * is projected down to this shape when the agent starts.
 */

import type { AgentModel } from "@pi-oxide/pi-host-web";
import type {
	AgentDiagnosticEvent,
	ProviderKind,
	TokenLimitParam,
} from "../types/messages";
import type { AnthropicConfig } from "./anthropic";
import { createAnthropicModel } from "./anthropic-model";
import type { OpenAIConfig } from "./openai";
import { createOpenAIModel } from "./openai-model";

export interface RuntimeProvider {
	kind: ProviderKind;
	apiKey: string;
	chatEndpointUrl: string;
	model: string;
	tokenLimitParam: TokenLimitParam;
}

export function createProviderModel(
	provider: RuntimeProvider,
	onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
): AgentModel {
	switch (provider.kind) {
		case "anthropic":
		case "anthropic-compatible": {
			const config: AnthropicConfig = {
				apiKey: provider.apiKey,
				chatEndpointUrl: provider.chatEndpointUrl,
				model: provider.model,
			};
			return createAnthropicModel(config, onDiagnostic);
		}
		case "openai":
		case "deepseek":
		case "openai-compatible": {
			const config: OpenAIConfig = {
				apiKey: provider.apiKey,
				chatEndpointUrl: provider.chatEndpointUrl,
				model: provider.model,
				tokenLimitParam: provider.tokenLimitParam,
			};
			return createOpenAIModel(config, onDiagnostic);
		}
	}
}
