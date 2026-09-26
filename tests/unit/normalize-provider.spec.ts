import { describe, expect, test } from "vitest";
import {
	normalizeStoredProvider,
	ProviderId,
	WireFormat,
} from "../../src/worker/provider-schema";

const base = {
	id: "p",
	name: "OpenAI",
	providerId: ProviderId.OpenAI,
	apiKey: "sk",
	modelsEndpointUrl: "https://api.openai.com/v1/models",
	defaultModelId: "m",
	models: [{ id: "m", name: "gpt-4o", model: "gpt-4o" }],
};

describe("normalizeStoredProvider", () => {
	test("rewrites the old official Chat Completions URL to Responses", () => {
		const next = normalizeStoredProvider({
			...base,
			wireFormat: WireFormat.OpenAIChatCompletions,
			chatEndpointUrl: "https://api.openai.com/v1/chat/completions",
		});
		expect(next.wireFormat).toBe(WireFormat.OpenAIResponses);
		expect(next.chatEndpointUrl).toBe("https://api.openai.com/v1/responses");
	});

	test("leaves a custom OpenAI URL on Chat Completions", () => {
		const stored = {
			...base,
			wireFormat: WireFormat.OpenAIChatCompletions,
			chatEndpointUrl: "https://proxy.example/v1/chat/completions",
		};
		expect(normalizeStoredProvider(stored)).toEqual(stored);
	});
});
