import { useEffect, useRef } from "preact/hooks";
import { useStore } from "zustand/react";
import type { SessionController } from "../../controllers/session-controller";
import {
	selectActiveSessionId,
	selectAgentStatus,
	selectApiKey,
	selectBaseUrl,
	selectModel,
	selectSessions,
} from "../../state/selectors";
import { browsergentStore } from "../../state/store";
import type { ChatMessage } from "../../types/messages";

export function useTitleGeneration(
	sessionControllerRef: { current: SessionController | null },
	messages: ChatMessage[],
): void {
	const status = useStore(browsergentStore, selectAgentStatus);
	const apiKey = useStore(browsergentStore, selectApiKey);
	const baseUrl = useStore(browsergentStore, selectBaseUrl);
	const model = useStore(browsergentStore, selectModel);
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
			const prompt = `Summarize this conversation in 5 words or less.\n\n${messages.map((m) => `${m.kind}: ${m.text}`).join("\n")}`;
			const key = apiKey;
			const url = baseUrl || "https://api.anthropic.com";
			const modelName = model || "claude-sonnet-4-20250514";

			const isLocalhost = (() => {
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
			})();
			if (isLocalhost) {
				titleGeneratedForSession.current.add(targetSessionId);
				return;
			}

			try {
				const response = await fetch(`${url}/v1/messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": key,
					},
					body: JSON.stringify({
						model: modelName,
						max_tokens: 20,
						messages: [{ role: "user", content: prompt }],
					}),
				});

				if (!response.ok) return;

				const data = (await response.json()) as {
					content?: Array<{ text?: string }>;
				};
				const title = data.content?.[0]?.text?.trim();
				if (!title) return;

				await sessionControllerRef.current?.updateTitle(
					targetSessionId,
					title,
					false,
				);
				browsergentStore.getState().sessionTitleUpdated(targetSessionId, title);
			} catch {
				// Silently ignore failures
			} finally {
				titleGeneratedForSession.current.add(targetSessionId);
			}
		}

		void generateTitle();
	}, [
		status,
		apiKey,
		baseUrl,
		model,
		messages,
		activeSessionId,
		sessions,
		sessionControllerRef,
	]);
}
