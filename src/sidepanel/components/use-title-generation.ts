import { useEffect, useRef } from "preact/hooks";
import { useStore } from "zustand/react";
import type { SessionController } from "../../controllers/session-controller";
import { classifyProviderResponse } from "../../errors/classify-provider-response";
import type { BrowsergentError } from "../../errors/browsergent-error";
import {
	selectActiveProvider,
	selectActiveSessionId,
	selectAgentStatus,
	selectSessions,
} from "../../state/selectors";
import type { ProviderConfig } from "../../state/slices/settings-slice";
import { browsergentStore } from "../../state/store";
import type { ChatMessage } from "../../types/messages";
import { defaultBaseUrlFor } from "../../worker/provider-defaults";
import { buildProviderRequest } from "../../worker/provider-request";

function isLocalhost(url: string): boolean {
	try {
		const u = new URL(url);
		return (
			u.hostname === "localhost" ||
			u.hostname === "127.0.0.1" ||
			u.hostname === "0.0.0.0" ||
			u.hostname === "::1"
		);
	} catch {
		return false;
	}
}

/** Classify a non-OK title-gen HTTP response as a typed BrowsergentError. */
export function classifyTitleResponse(
	status: number,
	body: string,
): BrowsergentError {
	return classifyProviderResponse(status, body, "Title");
}

/** POST a title-generation request shaped for the provider's wire format. */
async function requestTitle(
	provider: ProviderConfig,
	prompt: string,
	signal: AbortSignal,
): Promise<string | null> {
	const { url, headers } = buildProviderRequest(provider);

	// Body is identical across kinds; the wire differences are URL + auth + response shape.
	const body = {
		model: provider.model,
		max_tokens: 20,
		messages: [{ role: "user", content: prompt }],
	};

	const resp = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		signal,
	});
	if (!resp.ok) {
		const body = await resp.text().catch(() => "");
		throw classifyTitleResponse(resp.status, body);
	}

	const raw: unknown = await resp.json();
	if (
		typeof raw === "object" &&
		raw !== null &&
		"content" in raw &&
		Array.isArray(raw.content)
	) {
		const block = (raw.content as Array<{ text?: unknown }>)[0];
		return typeof block?.text === "string" ? block.text.trim() : null;
	}
	if (
		typeof raw === "object" &&
		raw !== null &&
		"choices" in raw &&
		Array.isArray(raw.choices)
	) {
		const choice = (
			raw.choices as Array<{ message?: { content?: unknown } }>
		)[0];
		const c = choice?.message?.content;
		return typeof c === "string" ? c.trim() : null;
	}
	return null;
}

export function useTitleGeneration(
	sessionControllerRef: { current: SessionController | null },
	messages: ChatMessage[],
): void {
	const status = useStore(browsergentStore, selectAgentStatus);
	const activeProvider = useStore(browsergentStore, selectActiveProvider);
	const sessions = useStore(browsergentStore, selectSessions);
	const activeSessionId = useStore(browsergentStore, selectActiveSessionId);
	const titleGeneratedForSession = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (status !== "done" && status !== "stopped") return;
		if (!activeSessionId) return;
		if (messages.length < 2) return;
		if (titleGeneratedForSession.current.has(activeSessionId)) return;

		const activeSession = sessions.find((s) => s.id === activeSessionId);
		if (activeSession?.title && !activeSession.title.startsWith("Session ")) {
			titleGeneratedForSession.current.add(activeSessionId);
			return;
		}

		const targetSessionId = activeSessionId;

		async function generateTitle() {
			// No provider configured, or localhost endpoint (no network): skip.
			if (!activeProvider?.apiKey) return;
			const provider = activeProvider;
			const base = provider.baseUrl || defaultBaseUrlFor(provider.kind);
			if (isLocalhost(base)) {
				titleGeneratedForSession.current.add(targetSessionId);
				return;
			}

			const prompt = `Summarize this conversation in 5 words or less.\n\n${messages.map((m) => `${m.kind}: ${m.text}`).join("\n")}`;
			const controller = new AbortController();
			const retryableStatus = new Set([429, 500, 502, 503, 504, 529]);

			try {
				const maxRetries = 3;
				for (let attempt = 0; attempt <= maxRetries; attempt++) {
					if (attempt > 0) {
						const delay = Math.min(500 * 2 ** (attempt - 1), 4000);
						await new Promise<void>((resolve) => setTimeout(resolve, delay));
					}

					try {
						const title = await requestTitle(
							provider,
							prompt,
							controller.signal,
						);
						if (title) {
							await sessionControllerRef.current?.updateTitle(
								targetSessionId,
								title,
								false,
							);
							browsergentStore
								.getState()
								.sessionTitleUpdated(targetSessionId, title);
							return;
						}
						// Malformed response body — not transient, stop.
						return;
					} catch (err) {
						// Only retry on transient server errors; bail on 4xx/other immediately.
						const status = (err as BrowsergentError).details?.status;
						if (typeof status !== "number" || !retryableStatus.has(status))
							return;
						if (attempt >= maxRetries) return;
					}
				}
			} finally {
				titleGeneratedForSession.current.add(targetSessionId);
			}
		}

		void generateTitle();
	}, [
		status,
		activeProvider,
		messages,
		activeSessionId,
		sessions,
		sessionControllerRef,
	]);
}
