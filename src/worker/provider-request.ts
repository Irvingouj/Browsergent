import type { TokenLimitParam } from "../types/messages";
import { WireFormat } from "../types/messages";

export type ChatCompletionTokenLimit =
	| { max_tokens: number; max_completion_tokens?: never }
	| { max_tokens?: never; max_completion_tokens: number };

export interface ProviderChatMessage {
	role: string;
	content: string;
}

export type ProviderChatBody = {
	model: string;
	messages: ReadonlyArray<ProviderChatMessage>;
} & ChatCompletionTokenLimit;

export type ProviderRequest =
	| {
			wire: "anthropic";
			url: string;
			headers: Record<string, string>;
			tokenLimitParam: "max_tokens";
	  }
	| {
			wire: "openai";
			url: string;
			headers: Record<string, string>;
			tokenLimitParam: TokenLimitParam;
	  };

export interface ProviderRequestConfig {
	wireFormat: WireFormat;
	apiKey: string;
	chatEndpointUrl: string;
	tokenLimitParam: TokenLimitParam;
}

export function authHeadersFor(
	wireFormat: WireFormat,
	apiKey: string,
): Record<string, string> {
	switch (wireFormat) {
		case WireFormat.AnthropicMessages:
			return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
		case WireFormat.OpenAIChatCompletions:
			return { Authorization: `Bearer ${apiKey}` };
	}
}

export function buildProviderRequest(
	provider: ProviderRequestConfig,
): ProviderRequest {
	const url = provider.chatEndpointUrl.trim();
	const headers = authHeadersFor(provider.wireFormat, provider.apiKey);
	switch (provider.wireFormat) {
		case WireFormat.AnthropicMessages:
			return {
				wire: "anthropic",
				url,
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				tokenLimitParam: "max_tokens",
			};
		case WireFormat.OpenAIChatCompletions:
			return {
				wire: "openai",
				url,
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				tokenLimitParam: provider.tokenLimitParam,
			};
	}
}

export function buildTokenLimit(
	param: TokenLimitParam,
	tokens: number,
): ChatCompletionTokenLimit {
	switch (param) {
		case "max_completion_tokens":
			return { max_completion_tokens: tokens };
		case "max_tokens":
			return { max_tokens: tokens };
	}
}

export function buildProviderChatBody(
	request: ProviderRequest,
	model: string,
	maxTokens: number,
	messages: ReadonlyArray<ProviderChatMessage>,
): ProviderChatBody {
	return {
		model,
		...buildTokenLimit(request.tokenLimitParam, maxTokens),
		messages,
	};
}
