import type { BrowsergentError } from "../../errors/browsergent-error";
import { classifyProviderResponse } from "../../errors/classify-provider-response";
import {
	defaultModelForProvider,
	type ProviderConfig,
} from "../../state/slices/settings-slice";
import { ProviderId, WireFormat } from "../../types/messages";
import { buildResponsesRequestBody } from "../../worker/openai-responses-wire";
import {
	buildProviderChatBody,
	buildProviderRequest,
} from "../../worker/provider-request";

export type ConnectionResult =
	| { ok: true }
	| { ok: false; error: BrowsergentError };

/**
 * Send a minimal request to verify the provider endpoint, API key, and model
 * are reachable. Does NOT retry — Test Connection is a one-shot diagnostic, so
 * a transient 5xx is reported as-is rather than masked by backoff.
 *
 * Wire shape mirrors title-generation: a 1-token "ping" posted to the
 * provider's chat endpoint. Non-OK responses are classified through the shared
 * error-system classifier; network/abort failures are normalized to E_NETWORK.
 */
export async function testConnection(
	provider: ProviderConfig,
	signal: AbortSignal,
): Promise<ConnectionResult> {
	if (!provider.apiKey) {
		return {
			ok: false,
			error: {
				code: "E_NO_API_KEY",
				message: "API key is empty",
				source: "settings",
			},
		};
	}
	const model = defaultModelForProvider(provider);
	if (!model) {
		return {
			ok: false,
			error: {
				code: "E_PROVIDER_NOT_FOUND",
				message: "No model configured",
				source: "settings",
			},
		};
	}

	const codex = provider.providerId === ProviderId.OpenAICodex;
	const request = buildProviderRequest({
		wireFormat: provider.wireFormat,
		apiKey: provider.apiKey,
		chatEndpointUrl: provider.chatEndpointUrl,
		codexAccountId: codex ? provider.oauth?.accountId : undefined,
	});

	const body =
		provider.wireFormat === WireFormat.OpenAIResponses
			? buildResponsesRequestBody({
					model: model.model,
					instructions: "Reply with ok.",
					input: "ping",
					stream: codex,
					maxOutputTokens: 16,
					codex,
				})
			: buildProviderChatBody(request, model.model, 100, [
					{ role: "user", content: "ping" },
				]);

	let resp: Response;
	try {
		resp = await fetch(request.url, {
			method: "POST",
			headers: request.headers,
			body: JSON.stringify(body),
			signal,
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			return {
				ok: false,
				error: {
					code: "E_NETWORK",
					message: "Test cancelled",
					source: "settings",
					details: { aborted: true },
				},
			};
		}
		return {
			ok: false,
			error: {
				code: "E_NETWORK",
				message:
					err instanceof Error
						? `Network error: ${err.message}`
						: "Network error",
				source: "settings",
			},
		};
	}

	if (!resp.ok) {
		const text = await resp.text().catch(() => "");
		return { ok: false, error: classifyProviderResponse(resp.status, text) };
	}

	// A 2xx is enough. Cancel a streaming body so the socket does not stay open.
	await resp.body?.cancel().catch(() => undefined);
	return { ok: true };
}
