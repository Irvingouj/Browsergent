import type { ProviderKind, TokenLimitParam } from "../types/messages";

export type ChatCompletionTokenLimit =
	| { max_tokens: number; max_completion_tokens?: never }
	| { max_tokens?: never; max_completion_tokens: number };

export interface ProviderChatMessage {
	role: "user";
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
	kind: ProviderKind;
	apiKey: string;
	chatEndpointUrl: string;
	tokenLimitParam: TokenLimitParam;
}

function providerWire(kind: ProviderKind): ProviderRequest["wire"] {
	switch (kind) {
		case "anthropic":
		case "anthropic-compatible":
			return "anthropic";
		case "openai":
		case "deepseek":
		case "openai-compatible":
			return "openai";
	}
}

/**
 * Auth headers only (no Content-Type) — used by GET requests like model
 * discovery. Same dispatch as buildProviderRequest so a new kind is one edit.
 */
export function authHeadersFor(
	kind: ProviderKind,
	apiKey: string,
): Record<string, string> {
	if (providerWire(kind) === "anthropic") {
		return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
	}
	return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Shared provider-request scaffolding: exact endpoint URL fallback and the
 * x-api-key vs Authorization: Bearer auth dispatch.
 *
 * Consumed by title-generation and the Test Connection diagnostic so a future
 * provider kind (or a base-URL rule change) is a one-spot edit, not two places
 * that can silently drift. Callers keep their own response handling —
 * title-gen parses the JSON body, the diagnostic intentionally does not.
 */
export function buildProviderRequest(
	provider: ProviderRequestConfig,
): ProviderRequest {
	const url = provider.chatEndpointUrl.trim();
	const wire = providerWire(provider.kind);
	if (wire === "anthropic") {
		return {
			wire,
			url,
			headers: {
				"Content-Type": "application/json",
				"x-api-key": provider.apiKey,
				"anthropic-version": "2023-06-01",
			},
			tokenLimitParam: "max_tokens",
		};
	}
	return {
		wire,
		url,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${provider.apiKey}`,
		},
		tokenLimitParam: provider.tokenLimitParam,
	};
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
