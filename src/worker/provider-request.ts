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
	max_output_tokens?: number;
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
	codexAccountId?: string;
}

export function authHeadersFor(
	wireFormat: WireFormat,
	apiKey: string,
	codexAccountId?: string,
): Record<string, string> {
	switch (wireFormat) {
		case WireFormat.AnthropicMessages:
			return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
		case WireFormat.OpenAIChatCompletions:
			return { Authorization: `Bearer ${apiKey}` };
		case WireFormat.OpenAIResponses: {
			const headers: Record<string, string> = {
				Authorization: `Bearer ${apiKey}`,
			};
			if (codexAccountId) {
				headers["chatgpt-account-id"] = codexAccountId;
				headers.originator = "pi";
				headers["OpenAI-Beta"] = "responses=experimental";
			}
			return headers;
		}
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
			...authHeadersFor(
				provider.wireFormat,
				provider.apiKey,
				provider.codexAccountId,
			),
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
			: request.wireFormat === WireFormat.OpenAIResponses
				? { max_output_tokens: maxTokens }
				: { max_completion_tokens: maxTokens };
	return {
		model,
		...tokenLimitField,
		messages,
	};
}
