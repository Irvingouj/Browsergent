import type {
	ProviderConfig,
	ProviderModelConfig,
} from "../../state/slices/settings-slice";
import { authHeadersFor } from "../../worker/provider-request";
import { parseModelsResponse } from "../../worker/provider-schema";

export type ModelDiscoveryResult =
	| { ok: true; models: ProviderModelConfig[] }
	| { ok: false; error: string };

export async function discoverProviderModels(
	provider: ProviderConfig,
	signal?: AbortSignal,
): Promise<ModelDiscoveryResult> {
	if (!provider.apiKey) return { ok: false, error: "API key is empty" };
	if (!provider.modelsEndpointUrl) {
		return { ok: false, error: "Models endpoint URL is empty" };
	}

	let resp: Response;
	try {
		resp = await fetch(provider.modelsEndpointUrl, {
			method: "GET",
			headers: authHeadersFor(provider.wireFormat, provider.apiKey),
			signal,
		});
	} catch (err) {
		return {
			ok: false,
			error:
				err instanceof Error
					? `Network error: ${err.message}`
					: "Network error",
		};
	}

	if (!resp.ok) {
		const body = await resp.text().catch(() => "");
		return {
			ok: false,
			error: `Model discovery failed ${resp.status}: ${body || resp.statusText}`,
		};
	}

	const json: unknown = await resp.json().catch(() => null);
	const models = parseModelsResponse(
		json,
		provider.wireFormat,
		provider.providerId,
	);
	if (models.length === 0) {
		return { ok: false, error: "No language models found" };
	}

	return { ok: true, models };
}
