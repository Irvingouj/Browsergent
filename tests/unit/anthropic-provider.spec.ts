import { describe, expect, test, vi } from "vitest";
import { AnthropicProvider } from "../../src/worker/anthropic";

describe("AnthropicProvider", () => {
	test("returns error stream on 401 Unauthorized", async () => {
		const provider = new AnthropicProvider({
			apiKey: "bad-key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => "Invalid API key",
		});

		const stream = await provider.call({
			system_prompt: "",
			messages: [],
			tools: [],
		});

		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("401"),
		});

		const result = await stream.result;
		expect(result).toMatchObject({
			Err: {
				error: { code: "api_error", message: expect.stringContaining("401") },
				aborted: false,
			},
		});
	});

	test("returns error stream on 429 Rate Limited", async () => {
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => "Rate limited",
		});

		const stream = await provider.call({
			system_prompt: "",
			messages: [],
			tools: [],
		});

		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("429"),
		});
	});

	test("returns error stream on 500 Internal Server Error", async () => {
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => "Internal error",
		});

		const stream = await provider.call({
			system_prompt: "",
			messages: [],
			tools: [],
		});

		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("500"),
		});
	});

	test("returns error stream when response has no body", async () => {
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			body: null,
		});

		const stream = await provider.call({
			system_prompt: "",
			messages: [],
			tools: [],
		});

		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: "Anthropic response has no body",
		});
	});

	test("returns error stream on network error when fetch rejects", async () => {
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

		const stream = await provider.call({
			system_prompt: "",
			messages: [],
			tools: [],
		});

		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: "Network failure",
		});
	});

	test("uses Fireworks Authorization header when baseUrl includes fireworks.ai", async () => {
		const provider = new AnthropicProvider({
			apiKey: "fw-key",
			model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
			baseUrl: "https://api.fireworks.ai",
		});

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => "Bad request",
		});
		global.fetch = fetchSpy;

		await provider.call({
			system_prompt: "sys",
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 }],
			tools: [],
		});

		expect(fetchSpy).toHaveBeenCalledWith(
			"https://api.fireworks.ai/v1/messages",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer fw-key",
				}),
			}),
		);
	});

	test("uses Anthropic x-api-key header when baseUrl is default", async () => {
		const provider = new AnthropicProvider({
			apiKey: "anthropic-key",
			model: "claude-3-haiku-20240307",
		});

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => "Bad request",
		});
		global.fetch = fetchSpy;

		await provider.call({
			system_prompt: "sys",
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 }],
			tools: [],
		});

		expect(fetchSpy).toHaveBeenCalledWith(
			"https://api.anthropic.com/v1/messages",
			expect.objectContaining({
				headers: expect.objectContaining({
					"x-api-key": "anthropic-key",
					"anthropic-version": "2023-06-01",
				}),
			}),
		);
	});

	test("includes tools and messages in request body", async () => {
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => "Bad request",
		});
		global.fetch = fetchSpy;

		await provider.call({
			system_prompt: "You are a test agent",
			messages: [
				{ role: "user", content: [{ type: "text", text: "hello" }], timestamp: 1 },
			],
			tools: [
				{
					name: "run_js",
					description: "Run JS",
					parameters: { type: "object" },
				},
			],
		});

		const callArgs = fetchSpy.mock.calls[0];
		const body = JSON.parse(callArgs[1].body);
		expect(body).toMatchObject({
			model: "claude-3-haiku-20240307",
			max_tokens: 4096,
			system: "You are a test agent",
			messages: [{ role: "user", content: "hello" }],
			tools: [{ name: "run_js", description: "Run JS", input_schema: { type: "object" } }],
			stream: true,
		});
	});
});
