import { afterEach, describe, expect, test, vi } from "vitest";
import { discoverProviderModels } from "../../src/sidepanel/components/model-discovery";
import type { ProviderConfig } from "../../src/state/slices/settings-slice";

const anthropic: ProviderConfig = {
	id: "p1",
	name: "Anthropic",
	providerId: "anthropic",
	wireFormat: "anthropic-messages",
	chatEndpointUrl: "https://api.anthropic.com/v1/messages",
	modelsEndpointUrl: "https://api.anthropic.com/v1/models",
	apiKey: "sk-test",
	defaultModelId: "m1",
	models: [
		{
			id: "m1",
			name: "claude-sonnet-4-20250514",
			model: "claude-sonnet-4-20250514",
		},
	],
};

const openai: ProviderConfig = {
	id: "p2",
	name: "OpenAI",
	providerId: "openai",
	wireFormat: "openai-chat-completions",
	chatEndpointUrl: "https://api.openai.com/v1/chat/completions",
	modelsEndpointUrl: "https://api.openai.com/v1/models",
	apiKey: "sk-test",
	defaultModelId: "m2",
	models: [
		{
			id: "m2",
			name: "gpt-4o",
			model: "gpt-4o",
		},
	],
};

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
	vi.restoreAllMocks();
});

function jsonResp(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("discoverProviderModels", () => {

	test("rejects empty API key", async () => {
		const result = await discoverProviderModels({ ...anthropic, apiKey: "" });
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toBe("API key is empty");
	});

	test("rejects empty models endpoint URL", async () => {
		const result = await discoverProviderModels({
			...anthropic,
			modelsEndpointUrl: "",
		},);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toBe(
			"Models endpoint URL is empty",
		);
	});

	test("returns network error when fetch rejects", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toContain("Network error");
	});

	test("returns error on non-ok HTTP status", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(jsonResp({ error: "bad" }, 401));
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toContain("401");
	});

	test("parses model list with id and display_name", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			jsonResp({
				data: [
					{ id: "claude-3-opus", display_name: "Claude 3 Opus" },
					{ id: "claude-3-haiku" },
				],
			}),
		);
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.models).toHaveLength(2);
			expect(result.models[0]?.name).toBe("Claude 3 Opus");
			expect(result.models[0]?.model).toBe("claude-3-opus");
			expect(result.models[1]?.name).toBe("claude-3-haiku");
		}
	});

	test("uses Bearer auth for openai kind", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ data: [{ id: "gpt-4o" }] }));
		globalThis.fetch = fetchMock;
		await discoverProviderModels(openai);
		const [, init] = fetchMock.mock.calls[0] ?? [];
		const headers = (init as { headers?: Record<string, string> } | undefined)
			?.headers;
		expect(headers?.Authorization).toBe("Bearer sk-test");
		expect(headers?.["x-api-key"]).toBeUndefined();
	});

	test("uses x-api-key auth for anthropic kind", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ data: [{ id: "claude-3" }] }));
		globalThis.fetch = fetchMock;
		await discoverProviderModels(anthropic);
		const [, init] = fetchMock.mock.calls[0] ?? [];
		const headers = (init as { headers?: Record<string, string> } | undefined)
			?.headers;
		expect(headers?.["x-api-key"]).toBe("sk-test");
		expect(headers?.Authorization).toBeUndefined();
	});

	test("returns No models found when data is empty", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ data: [] }));
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toBe("No language models found");
	});

	test("returns No models found when response is malformed JSON", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response("not json", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			}),
		);
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toBe("No language models found");
	});

	test("returns No models found when data field is missing", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ foo: "bar" }));
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error).toBe("No language models found");
	});

	test("skips items without string id", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			jsonResp({
				data: [
					{ id: "valid-model" },
					{ id: 123 },
					{ display_name: "no id" },
					{ id: "" },
				],
			}),
		);
		const result = await discoverProviderModels(anthropic);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.models).toHaveLength(1);
	});

	test("passes abort signal to fetch", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResp({ data: [{ id: "m" }] }));
		globalThis.fetch = fetchMock;
		const controller = new AbortController();
		await discoverProviderModels(anthropic, controller.signal);
		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect((init as { signal?: AbortSignal } | undefined)?.signal).toBe(
			controller.signal,
		);
	});
	test("filters out non-language models (embeddings, tts, whisper, dall-e)", async () => {
		global.fetch = vi.fn().mockResolvedValue(
			jsonResp({ data: [
				{ id: "gpt-4o" },
				{ id: "gpt-4o-mini" },
				{ id: "text-embedding-3-small" },
				{ id: "tts-1" },
				{ id: "whisper-1" },
				{ id: "dall-e-3" },
				{ id: "text-moderation-latest" },
				{ id: "omni-moderation-latest" },
				{ id: "sora-2" },
				{ id: "gpt-image-1" },
				{ id: "o3-mini" },
			] }),
		);
		const result = await discoverProviderModels(openai);
		expect(result.ok).toBe(true);
		if (result.ok) {
			const modelIds = result.models.map((m) => m.model).sort();
			expect(modelIds).toEqual(["gpt-4o", "gpt-4o-mini", "o3-mini"]);
		}
	});

});
