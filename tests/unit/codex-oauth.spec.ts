import { afterEach, describe, expect, test, vi } from "vitest";
import {
	accountIdFromAccessToken,
	CODEX_REDIRECT_URI,
	createCodexAuthorizeRequest,
	ensureCodexAccess,
	exchangeCodexCode,
	parseCodexCallback,
	refreshCodexToken,
} from "../../src/auth/codex-oauth";
import { ProviderId, WireFormat } from "../../src/worker/provider-schema";

function jwt(payload: unknown): string {
	const encode = (value: string) =>
		btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${encode(JSON.stringify({ alg: "none" }))}.${encode(JSON.stringify(payload))}.sig`;
}

const ACCESS = jwt({
	"https://api.openai.com/auth": { chatgpt_account_id: "acct_123" },
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("codex oauth", () => {
	test("authorize URL uses the Codex localhost redirect and PKCE", async () => {
		const { url, verifier } = await createCodexAuthorizeRequest();
		const parsed = new URL(url);
		expect(parsed.origin + parsed.pathname).toBe(
			"https://auth.openai.com/oauth/authorize",
		);
		expect(parsed.searchParams.get("redirect_uri")).toBe(CODEX_REDIRECT_URI);
		expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
		expect(parsed.searchParams.get("originator")).toBe("pi");
		expect(parsed.searchParams.get("code_challenge")?.length).toBeGreaterThan(
			0,
		);
		expect(verifier.length).toBeGreaterThanOrEqual(43);
	});

	test("reads the code from the localhost callback", () => {
		expect(
			parseCodexCallback(
				"http://localhost:1455/auth/callback?code=abc&state=xyz",
			),
		).toEqual({ code: "abc", state: "xyz" });
		expect(parseCodexCallback("https://auth.openai.com/oauth/authorize")).toBe(
			null,
		);
	});

	test("reads the Codex account id from the access token", () => {
		expect(accountIdFromAccessToken(ACCESS)).toBe("acct_123");
	});

	test("exchanges an authorization code", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({
					access_token: ACCESS,
					refresh_token: "refresh-1",
					expires_in: 3600,
				}),
		});
		vi.stubGlobal("fetch", fetchMock);
		const creds = await exchangeCodexCode("code-1", "verifier-1");
		expect(creds.accountId).toBe("acct_123");
		expect(creds.refresh).toBe("refresh-1");
		const body = String(
			(fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body,
		);
		expect(body).toContain("grant_type=authorization_code");
		expect(body).toContain("code=code-1");
	});

	test("rejects a token body whose access_token is not a string", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify({ access_token: 5, expires_in: 60 }),
			}),
		);
		await expect(exchangeCodexCode("code", "verifier")).rejects.toThrow(
			/token response was invalid/,
		);
	});

	test("keeps the previous refresh token when the refresh response omits one", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: async () =>
					JSON.stringify({ access_token: ACCESS, expires_in: 60 }),
			}),
		);
		const creds = await refreshCodexToken("refresh-old");
		expect(creds.refresh).toBe("refresh-old");
		expect(creds.access).toBe(ACCESS);
	});

	test("refreshes a Codex provider only when the access token is near expiry", async () => {
		const provider = {
			id: "p",
			name: "ChatGPT Plus/Pro",
			providerId: ProviderId.OpenAICodex,
			wireFormat: WireFormat.OpenAIResponses,
			apiKey: "still-good",
			chatEndpointUrl: "https://chatgpt.com/backend-api/codex/responses",
			modelsEndpointUrl: "",
			defaultModelId: "m",
			models: [{ id: "m", name: "gpt-5.4", model: "gpt-5.4" }],
			oauth: {
				refreshToken: "refresh-old",
				expiresAt: Date.now() + 10 * 60_000,
				accountId: "acct_123",
			},
		};
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(ensureCodexAccess(provider)).resolves.toBe(provider);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
