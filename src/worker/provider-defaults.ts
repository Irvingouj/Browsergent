/**
 * Single source of truth for per-kind provider defaults — base URL, default
 * model, and human label. Consumed by the provider HTTP clients, the settings
 * UI presets, title-generation's fallback URL, and the migration paths so a
 * default bump lands in one place.
 *
 * `satisfies Record<ProviderKind, …>` makes indexing total: there is no
 * `ProviderKind` without an entry, so callers need no `!` / fallback.
 */

import type { ProviderKind } from "../types/messages";

export interface ProviderPreset {
	label: string;
	baseUrl: string;
	model: string;
}

export const PROVIDER_DEFAULTS: Record<ProviderKind, ProviderPreset> = {
	anthropic: {
		label: "Anthropic",
		baseUrl: "https://api.anthropic.com",
		model: "claude-sonnet-4-20250514",
	},
	openai: {
		label: "OpenAI",
		baseUrl: "https://api.openai.com",
		model: "gpt-4o",
	},
};

export function defaultBaseUrlFor(kind: ProviderKind): string {
	return PROVIDER_DEFAULTS[kind].baseUrl;
}

export function defaultModelFor(kind: ProviderKind): string {
	return PROVIDER_DEFAULTS[kind].model;
}
