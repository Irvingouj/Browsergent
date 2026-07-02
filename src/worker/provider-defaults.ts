/**
 * Single source of truth for per-kind provider defaults — base URL, default
 * model, and human label. Consumed by the provider HTTP clients, the settings
 * UI presets, title-generation's fallback URL, and the migration paths so a
 * default bump lands in one place.
 *
 * `satisfies Record<ProviderKind, …>` makes indexing total: there is no
 * `ProviderKind` without an entry, so callers need no `!` / fallback.
 */

import type { ProviderKind, TokenLimitParam } from "../types/messages";

export interface ProviderPreset {
	label: string;
	chatEndpointUrl: string;
	modelsEndpointUrl?: string;
	defaultModel: string;
	tokenLimitParam: TokenLimitParam;
}

export const PROVIDER_DEFAULTS: Record<ProviderKind, ProviderPreset> = {
	anthropic: {
		label: "Anthropic",
		chatEndpointUrl: "https://api.anthropic.com/v1/messages",
		modelsEndpointUrl: "https://api.anthropic.com/v1/models",
		defaultModel: "claude-sonnet-4-20250514",
		tokenLimitParam: "max_tokens",
	},
	openai: {
		label: "OpenAI",
		chatEndpointUrl: "https://api.openai.com/v1/chat/completions",
		modelsEndpointUrl: "https://api.openai.com/v1/models",
		defaultModel: "gpt-4o",
		tokenLimitParam: "max_completion_tokens",
	},
	deepseek: {
		label: "DeepSeek",
		chatEndpointUrl: "https://api.deepseek.com/chat/completions",
		modelsEndpointUrl: "https://api.deepseek.com/models",
		defaultModel: "deepseek-chat",
		tokenLimitParam: "max_tokens",
	},
	"openai-compatible": {
		label: "OpenAI-compatible",
		chatEndpointUrl: "",
		modelsEndpointUrl: "",
		defaultModel: "",
		tokenLimitParam: "max_tokens",
	},
	"anthropic-compatible": {
		label: "Anthropic-compatible",
		chatEndpointUrl: "",
		modelsEndpointUrl: "",
		defaultModel: "",
		tokenLimitParam: "max_tokens",
	},
};

export function defaultChatEndpointUrlFor(kind: ProviderKind): string {
	return PROVIDER_DEFAULTS[kind].chatEndpointUrl;
}

export function defaultModelFor(kind: ProviderKind): string {
	return PROVIDER_DEFAULTS[kind].defaultModel;
}

export function defaultTokenLimitParamFor(kind: ProviderKind): TokenLimitParam {
	return PROVIDER_DEFAULTS[kind].tokenLimitParam;
}
