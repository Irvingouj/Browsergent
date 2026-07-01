import { afterEach, describe, expect, test, vi } from "vitest";
import { testConnection } from "../../src/sidepanel/components/test-connection";
import type { ProviderConfig } from "../../src/state/slices/settings-slice";

const anthropic: ProviderConfig = {
	id: "p1",
	name: "Anthropic",
	kind: "anthropic",
	baseUrl: "https://api.anthropic.com",
	apiKey: "sk-test",
	model: "claude-sonnet-4-20250514",
};

const openai: ProviderConfig = {
	id: "p2",
	name: "OpenAI",
	kind: "openai",
	baseUrl: "https://api.openai.com",
	apiKey: "sk-test",
	model: "gpt-4o",
};

const realFetch = global.fetch;

afterEach(() => {
	global.fetch = realFetch;
	vi.restoreAllMocks();
});

function mockFetchOk(): void {
	global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
}

function mockFetchStatus(status: number, body = "error body"): void {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
		status,
		text: async () => body,
	}) as never;
}

function mockFetchNetwork(error: unknown): void {
	global.fetch = vi.fn().mockRejectedValue(error) as never;
}

describe("testConnection", () => {
	test("2xx → ok", async () => {
		mockFetchOk();
		const result = await testConnection(
			anthropic,
			new AbortController().signal,
		);
		expect(result).toEqual({ ok: true });
	});

	test("401 → E_PROVIDER_AUTH", async () => {
		mockFetchStatus(401, "invalid key");
		const result = await testConnection(
			anthropic,
			new AbortController().signal,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("E_PROVIDER_AUTH");
			expect(result.error.source).toBe("settings");
			expect(result.error.details?.status).toBe(401);
		}
	});

	test("404 → E_PROVIDER_NOT_FOUND", async () => {
		mockFetchStatus(404, "model not found");
		const result = await testConnection(
			anthropic,
			new AbortController().signal,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("E_PROVIDER_NOT_FOUND");
	});

	test("500 → E_NETWORK", async () => {
		mockFetchStatus(500, "boom");
		const result = await testConnection(
			anthropic,
			new AbortController().signal,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("E_NETWORK");
	});

	test("network throw → E_NETWORK with message", async () => {
		mockFetchNetwork(new TypeError("fetch failed"));
		const result = await testConnection(
			anthropic,
			new AbortController().signal,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("E_NETWORK");
			expect(result.error.message).toContain("fetch failed");
		}
	});

	test("empty apiKey → E_NO_API_KEY, no fetch", async () => {
		const fetchMock = vi.fn();
		global.fetch = fetchMock as never;
		const result = await testConnection(
			{ ...anthropic, apiKey: "" },
			new AbortController().signal,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("E_NO_API_KEY");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("openai kind posts to /v1/chat/completions with Bearer auth", async () => {
		mockFetchOk();
		await testConnection(openai, new AbortController().signal);
		const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>)
			.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.openai.com/v1/chat/completions");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-test");
		expect(headers["x-api-key"]).toBeUndefined();
	});

	test("anthropic kind posts to /v1/messages with x-api-key", async () => {
		mockFetchOk();
		await testConnection(anthropic, new AbortController().signal);
		const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>)
			.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.anthropic.com/v1/messages");
		const headers = init.headers as Record<string, string>;
		expect(headers["x-api-key"]).toBe("sk-test");
		expect(headers.Authorization).toBeUndefined();
	});

	test("baseUrl trailing slash is trimmed", async () => {
		mockFetchOk();
		await testConnection(
			{ ...anthropic, baseUrl: "https://api.anthropic.com/" },
			new AbortController().signal,
		);
		const [url] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.anthropic.com/v1/messages");
	});

	test("abort → E_NETWORK with aborted detail", async () => {
		const controller = new AbortController();
		// Real fetch rejects with AbortError when the signal aborts.
		global.fetch = vi.fn().mockImplementation(() => {
			return new Promise<Response>((_resolve, reject) => {
				controller.signal.addEventListener("abort", () => {
					reject(new DOMException("Aborted", "AbortError"));
				});
			});
		}) as never;
		const pending = testConnection(anthropic, controller.signal);
		controller.abort();
		const result = await pending;
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("E_NETWORK");
			expect(result.error.details?.aborted).toBe(true);
		}
	});
});
