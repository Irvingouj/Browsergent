import { WireFormat } from "../types/messages";

export interface ProviderChatMessage {
	role: string;
	content: string;
}

export type ProviderChatBody = {
	model: string;
	messages: ReadonlyArray<ProviderChatMessage>;
	max_tokens?: number;
	max_completion_tokens?: number;
};
export type ProviderRequest = {
	url: string;
	headers: Record<string, string>;
	wireFormat: WireFormat;
};

export interface ProviderRequestConfig {
	wireFormat: WireFormat;
	apiKey: string;
	chatEndpointUrl: string;
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
	return {
		url,
		headers: {
			"Content-Type": "application/json",
			...authHeadersFor(provider.wireFormat, provider.apiKey),
		},
		wireFormat: provider.wireFormat,
	};
}

export function buildProviderChatBody(
	request: ProviderRequest,
	model: string,
	maxTokens: number,
	messages: ReadonlyArray<ProviderChatMessage>,
): ProviderChatBody {
	const tokenLimitField =
		request.wireFormat === WireFormat.AnthropicMessages
			? { max_tokens: maxTokens }
			: { max_completion_tokens: maxTokens };
	return {
		model,
		...tokenLimitField,
		messages,
	};
}
