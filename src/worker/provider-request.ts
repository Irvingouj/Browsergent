import type { ProviderConfig } from "../state/slices/settings-slice";
import { defaultBaseUrlFor } from "./provider-defaults";

/**
 * Shared provider-request scaffolding: base-URL normalization, the
 * anthropic → /v1/messages vs openai → /v1/chat/completions URL split, and the
 * x-api-key vs Authorization: Bearer auth dispatch.
 *
 * Consumed by title-generation and the Test Connection diagnostic so a future
 * provider kind (or a base-URL rule change) is a one-spot edit, not two places
 * that can silently drift. Callers keep their own response handling —
 * title-gen parses the JSON body, the diagnostic intentionally does not.
 */
export function buildProviderRequest(provider: ProviderConfig): {
	url: string;
	headers: Record<string, string>;
} {
	const base = (provider.baseUrl || defaultBaseUrlFor(provider.kind)).replace(
		/\/$/,
		"",
	);
	const url =
		provider.kind === "anthropic"
			? `${base}/v1/messages`
			: `${base}/v1/chat/completions`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (provider.kind === "anthropic") {
		headers["x-api-key"] = provider.apiKey;
	} else {
		headers.Authorization = `Bearer ${provider.apiKey}`;
	}
	return { url, headers };
}
