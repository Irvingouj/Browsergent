import type { BrowsergentError } from "../../errors/browsergent-error";
import { classifyProviderResponse } from "../../errors/classify-provider-response";
import type { ProviderConfig } from "../../state/slices/settings-slice";
import { buildProviderRequest } from "../../worker/provider-request";

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

	const { url, headers } = buildProviderRequest(provider);

	const body = {
		model: provider.model,
		max_tokens: 1,
		messages: [{ role: "user", content: "ping" }],
	};

	let resp: Response;
	try {
		resp = await fetch(url, {
			method: "POST",
			headers,
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

	// Body is intentionally unread — a 2xx is sufficient proof of reachability.
	return { ok: true };
}