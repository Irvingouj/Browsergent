import { describe, expect, test, vi } from "vitest";
import { AnthropicProvider } from "../../src/worker/anthropic";
import type { AgentDiagnosticEvent } from "../../src/types/messages";

// Mock headers map so resp.headers.get("retry-after") works in tests
function mockHeaders(retryAfter?: string): Headers {
	const h = new Headers();
	if (retryAfter !== undefined) h.set("retry-after", retryAfter);
	return h;
}

const noopContext = {
	system_prompt: "",
	messages: [],
	tools: [],
};

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
			headers: mockHeaders(),
		});

		const stream = await provider.call(noopContext);

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

	test("retries on 429 then exhausts and returns error", async () => {
		vi.useFakeTimers();
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => "Rate limited",
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);

		const stream = await promise;
		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		// 1 initial + 3 retries = 4 calls
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("429"),
		});

		const result = await stream.result;
		expect(result).toMatchObject({
			Err: {
				error: { code: "api_error", message: expect.stringContaining("429") },
				aborted: false,
			},
		});
		vi.useRealTimers();
	});

	test("retries on 500 then exhausts and returns error", async () => {
		vi.useFakeTimers();
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => "Internal error",
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);

		const stream = await promise;
		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("500"),
		});
		vi.useRealTimers();
	});

	test("retries on 529 overload then exhausts", async () => {
		vi.useFakeTimers();
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 529,
			text: async () => "Overloaded",
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);

		const stream = await promise;
		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("529"),
		});
		vi.useRealTimers();
	});

	test("emits provider_retry diagnostic on each retry", async () => {
		vi.useFakeTimers();
		const diagnostics: AgentDiagnosticEvent[] = [];
		const provider = new AnthropicProvider(
			{ apiKey: "key", model: "claude-3-haiku-20240307" },
			(e) => diagnostics.push(e),
		);

		let callCount = 0;
		global.fetch = vi.fn().mockImplementation(() => {
			callCount++;
			return Promise.resolve({
				ok: false,
				status: callCount < 2 ? 429 : 400,
				text: async () => "Error",
				headers: mockHeaders(),
			});
		});

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(10000);

		const stream = await promise;
		for await (const _ of stream.chunks) {
			// drain
		}

		const retries = diagnostics.filter((d) => d.kind === "provider_retry");
		expect(retries).toHaveLength(1);
		expect(retries[0]).toMatchObject({
			kind: "provider_retry",
			attempt: 1,
			maxAttempts: 3,
			status: 429,
			recoverable: true,
		});
		vi.useRealTimers();
	});

	test("honors retry-after header (seconds) for delay", async () => {
		vi.useFakeTimers();
		const diagnostics: AgentDiagnosticEvent[] = [];
		const provider = new AnthropicProvider(
			{ apiKey: "key", model: "claude-3-haiku-20240307" },
			(e) => diagnostics.push(e),
		);

		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => "Rate limited",
			headers: mockHeaders("2"),
		});

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);

		const stream = await promise;
		for await (const _ of stream.chunks) {
			// drain
		}

		const retries = diagnostics.filter((d) => d.kind === "provider_retry");
		expect(retries[0]).toMatchObject({
			kind: "provider_retry",
			delayMs: 2000,
		});
		vi.useRealTimers();
	});

	test("returns error stream when response has no body", async () => {
		vi.useFakeTimers();
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			body: null,
			headers: mockHeaders(),
		});

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);

		const stream = await promise;
		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: "Anthropic response has no body",
		});
		vi.useRealTimers();
	});

	test("returns error stream on network error when fetch rejects", async () => {
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

		const stream = await provider.call(noopContext);

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

	test("retries on TypeError (fetch failure) then exhausts", async () => {
		vi.useFakeTimers();
		const provider = new AnthropicProvider({
			apiKey: "key",
			model: "claude-3-haiku-20240307",
		});

		const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		global.fetch = fetchMock;

		const promise = provider.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);

		const stream = await promise;
		const chunks: unknown[] = [];
		for await (const chunk of stream.chunks) {
			chunks.push(chunk);
		}

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(chunks[0]).toMatchObject({
			kind: "error",
			message: "fetch failed",
		});
		vi.useRealTimers();
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
			headers: mockHeaders(),
		});
		global.fetch = fetchSpy;

		await provider.call({
			system_prompt: "sys",
			messages: [
				{ role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 },
			],
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
			headers: mockHeaders(),
		});
		global.fetch = fetchSpy;

		await provider.call({
			system_prompt: "sys",
			messages: [
				{ role: "user", content: [{ type: "text", text: "hi" }], timestamp: 1 },
			],
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
			headers: mockHeaders(),
		});
		global.fetch = fetchSpy;

		await provider.call({
			system_prompt: "You are a test agent",
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: "hello" }],
					timestamp: 1,
				},
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
			tools: [
				{
					name: "run_js",
					description: "Run JS",
					input_schema: { type: "object" },
				},
			],
			stream: true,
		});
	});
});