import type { ProviderPreset } from "./provider-schema";
import { ProviderId, WireFormat } from "./provider-schema";

export const BUILTIN_PROVIDERS: Record<
	Exclude<ProviderId, typeof ProviderId.Custom>,
	ProviderPreset
> = {
	[ProviderId.Anthropic]: {
		id: ProviderId.Anthropic,
		label: "Anthropic",
		wireFormat: WireFormat.AnthropicMessages,
		chatEndpointUrl: "https://api.anthropic.com/v1/messages",
		modelsEndpointUrl: "https://api.anthropic.com/v1/models",
		defaultModel: "claude-sonnet-4-20250514",
	},
	[ProviderId.OpenAI]: {
		id: ProviderId.OpenAI,
		label: "OpenAI (Chat Completions)",
		wireFormat: WireFormat.OpenAIChatCompletions,
		chatEndpointUrl: "https://api.openai.com/v1/chat/completions",
		modelsEndpointUrl: "https://api.openai.com/v1/models",
		defaultModel: "gpt-4o",
	},
	[ProviderId.DeepSeek]: {
		id: ProviderId.DeepSeek,
		label: "DeepSeek",
		wireFormat: WireFormat.OpenAIChatCompletions,
		chatEndpointUrl: "https://api.deepseek.com/chat/completions",
		modelsEndpointUrl: "https://api.deepseek.com/models",
		defaultModel: "deepseek-chat",
	},
};

export const BUILTIN_PROVIDER_LIST = Object.values(BUILTIN_PROVIDERS);

export function getPreset(id: ProviderId): ProviderPreset | null {
	if (id === ProviderId.Custom) return null;
	return BUILTIN_PROVIDERS[id] ?? null;
}
