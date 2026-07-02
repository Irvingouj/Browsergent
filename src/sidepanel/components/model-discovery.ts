import type {
	ProviderConfig,
	ProviderModelConfig,
} from "../../state/slices/settings-slice";
import { defaultTokenLimitParamFor } from "../../worker/provider-defaults";
import { authHeadersFor } from "../../worker/provider-request";

export type ModelDiscoveryResult =
	| { ok: true; models: ProviderModelConfig[] }
	| { ok: false; error: string };

interface ModelListItem {
	id: string;
	displayName?: string;
}

function parseModelList(raw: unknown): ModelListItem[] {
	if (typeof raw !== "object" || raw === null || !("data" in raw)) return [];
	const data = (raw as { data?: unknown }).data;
	if (!Array.isArray(data)) return [];
	const models: ModelListItem[] = [];
	for (const item of data) {
		if (typeof item !== "object" || item === null || !("id" in item)) continue;
		const id = (item as { id?: unknown }).id;
		if (typeof id !== "string" || !id) continue;
		const displayName = (item as { display_name?: unknown }).display_name;
		models.push({
			id,
			displayName: typeof displayName === "string" ? displayName : undefined,
		});
	}
	return models;
}

export async function discoverProviderModels(
	provider: ProviderConfig,
	signal?: AbortSignal,
): Promise<ModelDiscoveryResult> {
	if (
		provider.kind !== "anthropic" &&
		provider.kind !== "openai" &&
		provider.kind !== "deepseek"
	) {
		return { ok: false, error: "Model discovery is not supported" };
	}
	if (!provider.apiKey) return { ok: false, error: "API key is empty" };
	if (!provider.modelsEndpointUrl) {
		return { ok: false, error: "Models endpoint URL is empty" };
	}

	let resp: Response;
	try {
		resp = await fetch(provider.modelsEndpointUrl, {
			method: "GET",
			headers: authHeadersFor(provider.kind, provider.apiKey),
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

	const raw: unknown = await resp.json().catch(() => null);
	const tokenLimitParam = defaultTokenLimitParamFor(provider.kind);
	const models = parseModelList(raw).map((model) => ({
		id: crypto.randomUUID(),
		name: model.displayName ?? model.id,
		model: model.id,
		tokenLimitParam,
	}));
	if (models.length === 0) {
		return { ok: false, error: "No models found" };
	}
	return { ok: true, models };
}
