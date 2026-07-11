import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import type {
	AgentDiagnosticEvent,
	AgentTraceEntry,
	ChatMessage,
	WorkerToPanel,
} from "../types/messages";

export interface SessionSnapshot {
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
	diagnostics: AgentDiagnosticEvent[];
	/** Partial assistant text keyed by message id (headless streaming). */
	streamingText: Map<string, string>;
}

export function createSessionSnapshot(
	messages: ChatMessage[] = [],
	trace: AgentTraceEntry[] = [],
	diagnostics: AgentDiagnosticEvent[] = [],
): SessionSnapshot {
	return {
		messages: [...messages],
		trace: [...trace],
		diagnostics: [...diagnostics],
		streamingText: new Map(),
	};
}

function upsertAssistantText(
	snapshot: SessionSnapshot,
	messageId: string,
	text: string,
): void {
	const idx = snapshot.messages.findIndex(
		(m) => m.id === messageId && m.kind === "assistant",
	);
	if (idx >= 0) {
		const existing = snapshot.messages[idx];
		if (existing?.kind === "assistant") {
			snapshot.messages[idx] = { ...existing, text };
		}
		return;
	}
	snapshot.messages.push({
		kind: "assistant",
		id: messageId,
		text,
		timestamp: Date.now(),
	});
}

function upsertAssistantFromMessage(
	snapshot: SessionSnapshot,
	message: Extract<ChatMessage, { kind: "assistant" }>,
): void {
	const streamed = snapshot.streamingText.get(message.id);
	const text = streamed ?? message.text;
	snapshot.streamingText.delete(message.id);
	const idx = snapshot.messages.findIndex(
		(m) => m.id === message.id && m.kind === "assistant",
	);
	if (idx >= 0) {
		snapshot.messages[idx] = { ...message, text };
		return;
	}
	snapshot.messages.push({ ...message, text });
}

export function applyRunEvent(
	snapshot: SessionSnapshot,
	event: WorkerToPanel,
): void {
	switch (event.type) {
		case "agentMessage": {
			const { message } = event;
			if (message.kind === "assistant") {
				upsertAssistantFromMessage(snapshot, message);
			} else {
				// Idempotent: dual relay channels must not triple-store the same bubble.
				if (snapshot.messages.some((m) => m.id === message.id)) break;
				snapshot.messages.push(message);
			}
			break;
		}
		case "agentTextDelta": {
			const prev = snapshot.streamingText.get(event.messageId) ?? "";
			const next = prev + event.text;
			snapshot.streamingText.set(event.messageId, next);
			upsertAssistantText(snapshot, event.messageId, next);
			break;
		}
		case "agentMessageEnd": {
			const text = snapshot.streamingText.get(event.messageId);
			if (text !== undefined) {
				upsertAssistantText(snapshot, event.messageId, text);
				snapshot.streamingText.delete(event.messageId);
			}
			break;
		}
		case "agentTrace": {
			snapshot.trace.push(event.entry);
			break;
		}
		case "agentDiagnostic": {
			snapshot.diagnostics.push(event.event);
			break;
		}
		case "agentError": {
			const code =
				typeof event.error.code === "string"
					? event.error.code
					: ("E_UNKNOWN" as BrowsergentErrorCode);
			snapshot.messages.push({
				kind: "system",
				id: crypto.randomUUID(),
				text: `Error: ${event.error.message}`,
				timestamp: Date.now(),
			});
			void code;
			break;
		}
		default:
			break;
	}
}
