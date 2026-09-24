import type { AgentHistoryMessage } from "@pi-oxide/pi-host-web";
import { SessionController } from "../../src/controllers/session-controller";
import type { StorageBackend } from "../../src/storage/storage-backend";
import type {
	AgentDiagnosticEvent,
	AgentTraceEntry,
	ChatMessage,
} from "../../src/types/messages";
import {
	appendTranscriptEntry,
	emptySessionTranscript,
	type SessionTranscript,
} from "../../src/types/session-transcript";

export const TEST_WINDOW_ID = 1;

export async function initBoundController(
	storage: StorageBackend,
	windowId = TEST_WINDOW_ID,
): Promise<{ ctrl: SessionController; sessionId: string }> {
	const ctrl = new SessionController(storage);
	const save = ctrl.save.bind(ctrl);
	ctrl.save = (messages, trace, diagnostics = [], transcript) =>
		save(
			messages,
			trace,
			diagnostics,
			transcript ?? transcriptFromMessages(messages),
		);
	await ctrl.init();
	const sessionId = await ctrl.resolveOrCreateForWindow(windowId);
	return { ctrl, sessionId };
}

export function requireActiveId(ctrl: SessionController): string {
	const id = ctrl.getActiveSessionId();
	if (id === null) throw new Error("no active session");
	return id;
}

export function transcriptFromMessages(
	messages: ChatMessage[],
): SessionTranscript {
	let transcript = emptySessionTranscript();
	let turnNumber = 0;
	for (const message of messages) {
		let historyMessage: AgentHistoryMessage;
		if (message.kind === "user") {
			turnNumber++;
			historyMessage = {
				role: "user",
				content: [{ type: "text", text: message.text }],
				timestamp: message.timestamp,
			};
		} else if (message.kind === "assistant") {
			historyMessage = {
				role: "assistant",
				content: [{ type: "text", text: message.text }],
				api: "openai",
				provider: "test",
				model: "test-model",
				stopReason: "end_turn",
				timestamp: message.timestamp,
				usage: {
					input: 0,
					output: 0,
					cache_read: 0,
					cache_write: 0,
					total_tokens: 0,
				},
			};
		} else {
			continue;
		}
		transcript = appendTranscriptEntry(transcript, {
			entryId: message.id,
			parentId: transcript.leafId,
			turnNumber,
			displayText: message.text,
			message: historyMessage,
		});
	}
	return transcript;
}

export async function saveWithTranscript(
	ctrl: SessionController,
	messages: ChatMessage[],
	trace: AgentTraceEntry[],
	diagnostics: AgentDiagnosticEvent[] = [],
): Promise<void> {
	await ctrl.save(
		messages,
		trace,
		diagnostics,
		transcriptFromMessages(messages),
	);
}

export function scheduleSaveWithTranscript(
	ctrl: SessionController,
	messages: ChatMessage[],
	trace: AgentTraceEntry[],
	diagnostics: AgentDiagnosticEvent[] = [],
): void {
	ctrl.scheduleSave(
		messages,
		trace,
		diagnostics,
		transcriptFromMessages(messages),
	);
}

export async function flushSaveWithTranscript(
	ctrl: SessionController,
	messages: ChatMessage[],
	trace: AgentTraceEntry[],
	diagnostics: AgentDiagnosticEvent[] = [],
): Promise<void> {
	await ctrl.flushSave(
		messages,
		trace,
		diagnostics,
		transcriptFromMessages(messages),
	);
}
