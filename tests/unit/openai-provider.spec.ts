import { describe, expect, test, vi } from "vitest";
import { OpenAIProvider } from "../../src/worker/openai";

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

async function collect(stream: {
	chunks: AsyncGenerator<{ kind: string; message?: string }>;
}) {
	const chunks: Array<{ kind: string; message?: string }> = [];
	for await (const chunk of stream.chunks) chunks.push(chunk);
	return chunks;
}

describe("OpenAIProvider", () => {
	test("returns error stream on 401 Unauthorized", async () => {
		const provider = new OpenAIProvider({
			apiKey: "bad",
			model: "gpt-4o-mini",
		});
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => "Invalid API key",
			headers: mockHeaders(),
		});

		const stream = await provider.call(noopContext);
		const chunks = await collect(stream);

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

	test("uses Authorization: Bearer header", async () => {
		const provider = new OpenAIProvider({ apiKey: "sk-test", model: "gpt-4o" });
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(c) {
					c.close();
				},
			}),
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		await provider.call(noopContext);
		const [, init] = fetchMock.mock.calls[0] ?? [];
		const headers = (init as { headers?: Record<string, string> } | undefined)
			?.headers;
		expect(headers?.Authorization).toBe("Bearer sk-test");
		expect(headers?.["Content-Type"]).toBe("application/json");
	});

	test("posts to {baseUrl}/v1/chat/completions", async () => {
		const provider = new OpenAIProvider({
			apiKey: "k",
			model: "m",
			baseUrl: "https://api.deepseek.com",
		});
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(c) {
					c.close();
				},
			}),
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		await provider.call(noopContext);
		const url = fetchMock.mock.calls[0]?.[0] as string;
		expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
	});

	test("strips trailing slash from baseUrl", async () => {
		const provider = new OpenAIProvider({
			apiKey: "k",
			model: "m",
			baseUrl: "https://api.deepseek.com/",
		});
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(c) {
					c.close();
				},
			}),
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		await provider.call(noopContext);
		const url = fetchMock.mock.calls[0]?.[0] as string;
		expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
	});

	test("returns error stream when response has no body", async () => {
		const provider = new OpenAIProvider({ apiKey: "k", model: "m" });
		global.fetch = vi
			.fn()
			.mockResolvedValue({ ok: true, body: null, headers: mockHeaders() });
		const stream = await provider.call(noopContext);
		const chunks = await collect(stream);
		expect(chunks[0]?.kind).toBe("error");
	});

	test("includes messages and tools in request body, stream:true", async () => {
		const provider = new OpenAIProvider({ apiKey: "k", model: "gpt-4o" });
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			body: new ReadableStream({
				start(c) {
					c.close();
				},
			}),
			headers: mockHeaders(),
		});
		global.fetch = fetchMock;

		await provider.call({
			system_prompt: "sys",
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: "hi" }],
					timestamp: 1,
				},
			],
			tools: [
				{
					name: "run_js",
					label: "run_js",
					description: "d",
					parameters: { type: "object" },
					execution_mode: "sequential",
				},
			],
		});

		const init = fetchMock.mock.calls[0]?.[1] as { body?: string };
		const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
		expect(body.stream).toBe(true);
		expect(body.max_tokens).toBe(4096);
		expect(body.model).toBe("gpt-4o");
		expect(body.tools).toEqual([
			{
				type: "function",
				function: {
					name: "run_js",
					description: "d",
					parameters: { type: "object" },
				},
			},
		]);
		const messages = body.messages as Array<{ role: string }>;
		expect(messages[0]?.role).toBe("system");
		expect(messages[1]?.role).toBe("user");
	});

	test("returns error stream on network error when fetch rejects", async () => {
		const provider = new OpenAIProvider({ apiKey: "k", model: "m" });
		global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		const stream = await provider.call(noopContext);
		const result = await stream.result;
		expect(result).toMatchObject({
			Err: { error: { code: "network_error" } },
		});
	});

	test("honors HTTP-date retry-after header (RFC 7231)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
		// 10 seconds in the future → retry should wait ~10000ms.
		const future = new Date(Date.now() + 10_000).toUTCString();
		const onDiagnostic = vi.fn();
		const providerWithDiag = new OpenAIProvider(
			{ apiKey: "k", model: "m" },
			onDiagnostic,
		);
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			text: async () => "rate limited",
			headers: mockHeaders(future),
		});

		const promise = providerWithDiag.call(noopContext);
		await vi.advanceTimersByTimeAsync(30000);
		const stream = await promise;
		await collect(stream);

		const retryEvent = onDiagnostic.mock.calls
			.map((c) => c[0])
			.find((e: { kind?: string }) => e.kind === "provider_retry");
		expect(retryEvent).toBeDefined();
		expect((retryEvent as { delayMs: number }).delayMs).toBeGreaterThanOrEqual(
			9000,
		);
		vi.useRealTimers();
	});
});
