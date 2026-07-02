/**
 * Type-first domain model. Every shape that crosses a trust boundary
 * (IndexedDB persistence, provider HTTP responses) is defined as a Zod
 * schema first; the TypeScript type is derived from the schema via z.infer.
 *
 * Rules:
 * - No `unknown` anywhere. External data enters through a .parse() call.
 * - No optional fields unless the data is genuinely optional. "Empty string"
 *   is a valid value for a required string — it means "not yet set".
 * - `null` only where null is a legal persisted value.
 */

import { z } from "zod";

// ── Enums (const objects, not TS enums — better for Zod + tree-shaking) ───

export const WireFormat = {
	AnthropicMessages: "anthropic-messages",
	OpenAIChatCompletions: "openai-chat-completions",
} as const;
export const wireFormatSchema = z.enum([
	WireFormat.AnthropicMessages,
	WireFormat.OpenAIChatCompletions,
]);
export type WireFormat = z.infer<typeof wireFormatSchema>;

export const ProviderId = {
	Anthropic: "anthropic",
	OpenAI: "openai",
	DeepSeek: "deepseek",
	Custom: "custom",
} as const;
export const providerIdSchema = z.enum([
	ProviderId.Anthropic,
	ProviderId.OpenAI,
	ProviderId.DeepSeek,
	ProviderId.Custom,
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const tokenLimitParamSchema = z.enum([
	"max_tokens",
	"max_completion_tokens",
]);
export type TokenLimitParam = z.infer<typeof tokenLimitParamSchema>;

// ── Persisted domain model (stored in IndexedDB) ─────────────────────────

export const providerModelConfigSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	model: z.string().min(1),
	tokenLimitParam: tokenLimitParamSchema,
});
export type ProviderModelConfig = z.infer<typeof providerModelConfigSchema>;

export const providerConfigSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	providerId: providerIdSchema,
	wireFormat: wireFormatSchema,
	apiKey: z.string(),
	chatEndpointUrl: z.string(),
	modelsEndpointUrl: z.string(),
	defaultModelId: z.string(),
	models: z.array(providerModelConfigSchema),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

// ── Built-in provider preset (NOT persisted — compile-time constant) ──────

export interface ProviderPreset {
	id: ProviderId;
	label: string;
	wireFormat: WireFormat;
	chatEndpointUrl: string;
	modelsEndpointUrl: string;
	defaultModel: string;
	tokenLimitParam: TokenLimitParam;
}

// ── Provider /models endpoint response schemas ───────────────────────────

const modelsEnvelopeSchema = z.object({
	data: z.array(z.record(z.string(), z.unknown())),
});

const openaiModelItemSchema = z.object({
	id: z.string().min(1),
	created: z.number().optional(),
});

const anthropicModelItemSchema = z.object({
	id: z.string().min(1),
	display_name: z.string().optional(),
	created_at: z.string().optional(),
});

// Normalized representation after parsing — all fields required, no optional.
interface NormalizedModel {
	id: string;
	displayName: string;
	created: number;
}

const NON_LANGUAGE_PREFIXES = [
	"text-embedding",
	"text-davinci",
	"whisper",
	"tts",
	"dall-e",
	"text-moderate",
	"text-search",
	"text-similarity",
	"ft:",
	"omni-moderate",
	"audio",
] as const;

function isLanguageModel(id: string): boolean {
	const lower = id.toLowerCase();
	return !NON_LANGUAGE_PREFIXES.some((p) => lower.startsWith(p));
}

function parseOpenAIModels(json: unknown): NormalizedModel[] {
	const envelope = modelsEnvelopeSchema.safeParse(json);
	if (!envelope.success) return [];
	return envelope.data.data
		.flatMap((item) => {
			const parsed = openaiModelItemSchema.safeParse(item);
			return parsed.success ? [parsed.data] : [];
		})
		.filter((m) => isLanguageModel(m.id))
		.map(
			(m): NormalizedModel => ({
				id: m.id,
				displayName: m.id,
				created: m.created ?? 0,
			}),
		);
}

function parseAnthropicModels(json: unknown): NormalizedModel[] {
	const envelope = modelsEnvelopeSchema.safeParse(json);
	if (!envelope.success) return [];
	return envelope.data.data
		.flatMap((item) => {
			const parsed = anthropicModelItemSchema.safeParse(item);
			return parsed.success ? [parsed.data] : [];
		})
		.map((m): NormalizedModel => {
			const createdMs = m.created_at ? Date.parse(m.created_at) : 0;
			return {
				id: m.id,
				displayName: m.display_name ?? m.id,
				created: Number.isNaN(createdMs) ? 0 : createdMs,
			};
		});
}

function sortByLatest(models: NormalizedModel[]): NormalizedModel[] {
	return [...models].sort((a, b) => {
		if (a.created !== b.created) return b.created - a.created;
		return b.id.localeCompare(a.id);
	});
}

export function parseModelsResponse(
	json: unknown,
	wireFormat: WireFormat,
	tokenLimitParam: TokenLimitParam,
): ProviderModelConfig[] {
	const raw =
		wireFormat === WireFormat.AnthropicMessages
			? parseAnthropicModels(json)
			: parseOpenAIModels(json);
	return sortByLatest(raw).map((m) => ({
		id: crypto.randomUUID(),
		name: m.displayName,
		model: m.id,
		tokenLimitParam,
	}));
}
