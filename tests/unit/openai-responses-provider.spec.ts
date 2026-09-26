import { describe, expect, test, vi } from "vitest";
import { OpenAIResponsesProvider } from "../../src/worker/openai-responses";

const context = { system_prompt: "sys", messages: [], tools: [] };

describe("OpenAIResponsesProvider", () => {
	test("posts a Responses body to the configured URL", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
			headers: new Headers(),
		});
		global.fetch = fetchMock;
		const provider = new OpenAIResponsesProvider({
			apiKey: "sk-test",
			model: "gpt-4o",
			chatEndpointUrl: "https://api.openai.com/v1/responses",
		});
		await provider.call(context);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.openai.com/v1/responses");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-test");
		expect(headers["chatgpt-account-id"]).toBeUndefined();
		const body = JSON.parse(String(init.body)) as Record<string, unknown>;
		expect(body.stream).toBe(true);
		expect(body.store).toBe(false);
		expect(body.max_output_tokens).toBe(4096);
		expect(body.instructions).toBe("sys");
	});

	test("adds Codex account headers and omits max_output_tokens", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
			headers: new Headers(),
		});
		global.fetch = fetchMock;
		const provider = new OpenAIResponsesProvider({
			apiKey: "access-token",
			model: "gpt-5.4",
			chatEndpointUrl: "https://chatgpt.com/backend-api/codex/responses",
			codexAccountId: "acct_1",
		});
		await provider.call(context);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer access-token");
		expect(headers["chatgpt-account-id"]).toBe("acct_1");
		expect(headers.originator).toBe("pi");
		const body = JSON.parse(String(init.body)) as Record<string, unknown>;
		expect(body.max_output_tokens).toBeUndefined();
		expect(body.store).toBe(false);
	});
});
