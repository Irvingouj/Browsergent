/**
 * ChatGPT Codex OAuth (Plus/Pro coding plan).
 *
 * The public Codex client only allows redirect_uri
 * http://localhost:1455/auth/callback. The side panel opens the authorize URL
 * and reads that redirect with webNavigation, then exchanges the code. No
 * local HTTP server is required; the tab fails to load and is closed.
 */

import { z } from "zod";
import type { ProviderConfig } from "../worker/provider-schema";
import { ProviderId } from "../worker/provider-schema";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_SKEW_MS = 60_000;

export interface CodexCredentials {
	access: string;
	refresh: string;
	expires: number;
	accountId: string;
}

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1).nullish(),
	expires_in: z.number(),
});

function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export function decodeJwtPayload(
	token: string,
): Record<string, unknown> | null {
	const part = token.split(".")[1];
	if (!part) return null;
	try {
		const padded = part.replace(/-/g, "+").replace(/_/g, "/");
		const json = atob(
			padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="),
		);
		const parsed: unknown = JSON.parse(json);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return null;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function accountIdFromAccessToken(token: string): string | null {
	const payload = decodeJwtPayload(token);
	const auth = payload?.[JWT_CLAIM_PATH];
	if (typeof auth !== "object" || auth === null || Array.isArray(auth))
		return null;
	const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
	return typeof accountId === "string" && accountId.length > 0
		? accountId
		: null;
}

export async function createCodexAuthorizeRequest(): Promise<{
	verifier: string;
	state: string;
	url: string;
}> {
	const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
	const verifier = base64url(verifierBytes);
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	const challenge = base64url(new Uint8Array(digest));
	const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
	const url = new URL(AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", CLIENT_ID);
	url.searchParams.set("redirect_uri", CODEX_REDIRECT_URI);
	url.searchParams.set("scope", SCOPE);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("id_token_add_organizations", "true");
	url.searchParams.set("codex_cli_simplified_flow", "true");
	url.searchParams.set("originator", "pi");
	return { verifier, state, url: url.toString() };
}

export function parseCodexCallback(
	url: string,
): { code?: string; state?: string } | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
		return null;
	}
	if (parsed.port !== "1455" || parsed.pathname !== "/auth/callback")
		return null;
	return {
		code: parsed.searchParams.get("code") ?? undefined,
		state: parsed.searchParams.get("state") ?? undefined,
	};
}

async function requestToken(
	body: URLSearchParams,
	fallbackRefresh?: string,
): Promise<CodexCredentials> {
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`ChatGPT sign-in failed (${response.status}): ${text || response.statusText}`,
		);
	}
	let parsed: z.infer<typeof tokenResponseSchema>;
	try {
		parsed = tokenResponseSchema.parse(JSON.parse(text));
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`ChatGPT token response was invalid: ${detail}`);
	}
	const refresh = parsed.refresh_token ?? fallbackRefresh;
	if (!refresh)
		throw new Error("ChatGPT token response was missing refresh_token");
	const accountId = accountIdFromAccessToken(parsed.access_token);
	if (!accountId) {
		throw new Error(
			"This ChatGPT account has no Codex account id. Coding plan needs Plus, Pro, or Business.",
		);
	}
	return {
		access: parsed.access_token,
		refresh,
		expires: Date.now() + parsed.expires_in * 1000,
		accountId,
	};
}

export function exchangeCodexCode(
	code: string,
	verifier: string,
): Promise<CodexCredentials> {
	return requestToken(
		new URLSearchParams({
			grant_type: "authorization_code",
			client_id: CLIENT_ID,
			code,
			code_verifier: verifier,
			redirect_uri: CODEX_REDIRECT_URI,
		}),
	);
}

export function refreshCodexToken(
	refreshToken: string,
): Promise<CodexCredentials> {
	return requestToken(
		new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CLIENT_ID,
		}),
		refreshToken,
	);
}

function waitForCodexCallback(
	expectedState: string,
	tabId: number | undefined,
): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			finish(() => reject(new Error("ChatGPT sign-in timed out")));
		}, LOGIN_TIMEOUT_MS);

		const finish = (fn: () => void): void => {
			if (settled) return;
			settled = true;
			cleanup();
			fn();
		};

		const onNavigate = (details: {
			url: string;
			tabId: number;
			frameId: number;
		}): void => {
			if (tabId !== undefined && details.tabId !== tabId) return;
			if (details.frameId !== 0) return;
			const parsed = parseCodexCallback(details.url);
			if (!parsed) return;
			if (parsed.state !== expectedState) {
				finish(() => reject(new Error("State mismatch")));
				return;
			}
			if (!parsed.code) {
				finish(() => reject(new Error("Missing authorization code")));
				return;
			}
			finish(() => resolve(parsed.code as string));
		};

		const onRemoved = (closedId: number): void => {
			if (tabId === undefined || closedId !== tabId) return;
			finish(() => reject(new Error("Sign-in window was closed")));
		};

		function cleanup(): void {
			clearTimeout(timeout);
			chrome.webNavigation.onBeforeNavigate.removeListener(onNavigate);
			chrome.webNavigation.onErrorOccurred.removeListener(onNavigate);
			chrome.tabs.onRemoved.removeListener(onRemoved);
		}

		chrome.webNavigation.onBeforeNavigate.addListener(onNavigate);
		chrome.webNavigation.onErrorOccurred.addListener(onNavigate);
		chrome.tabs.onRemoved.addListener(onRemoved);
	});
}

/** Open ChatGPT login and return credentials after the localhost redirect. */
export async function loginWithCodex(): Promise<CodexCredentials> {
	const { verifier, state, url } = await createCodexAuthorizeRequest();
	const tab = await chrome.tabs.create({ url, active: true });
	try {
		const code = await waitForCodexCallback(state, tab.id);
		return await exchangeCodexCode(code, verifier);
	} finally {
		if (tab.id !== undefined) {
			await chrome.tabs.remove(tab.id).catch(() => undefined);
		}
	}
}

/**
 * Refresh a Codex provider when the access token is near expiry.
 * Returns the same object when the token is still fresh.
 */
export async function ensureCodexAccess(
	provider: ProviderConfig,
): Promise<ProviderConfig> {
	if (provider.providerId !== ProviderId.OpenAICodex || !provider.oauth) {
		return provider;
	}
	if (
		provider.apiKey &&
		provider.oauth.expiresAt - Date.now() > REFRESH_SKEW_MS
	) {
		return provider;
	}
	const next = await refreshCodexToken(provider.oauth.refreshToken);
	return {
		...provider,
		apiKey: next.access,
		oauth: {
			refreshToken: next.refresh,
			expiresAt: next.expires,
			accountId: next.accountId,
		},
	};
}
