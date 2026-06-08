/**
 * Web Worker entry point.
 * Owns agent loop state, WASM loading, and message routing.
 *
 * The Worker never touches chrome.* APIs directly.
 * All JS execution is relayed to the main thread via postMessage,
 * where ExtensionSession (from @pi-oxide/extension-js) runs.
 */

/// <reference lib="webworker" />

import type { BrowsergentErrorCode } from "../errors/browsergent-error";
import type { CellResult } from "../types/extjs-utils";
import { formatError } from "../types/extjs-utils";
import type {
	AgentTraceEntry,
	PanelToWorker,
	WorkerSettings,
	WorkerToPanel,
} from "../types/messages";
import { enableStreamDebug, streamLog } from "../utils/stream-logger";
import { AgentLoop } from "./agent-loop";
import type { AnthropicConfig } from "./anthropic";

enableStreamDebug();

const VALID_ERROR_CODES = new Set<string>([
	"E_NO_API_KEY",
	"E_BAD_SETTINGS",
	"E_WORKER_CRASH",
	"E_LLM_REQUEST",
	"E_JS_COMPILE",
	"E_JS_RUNTIME",
	"E_JS_TIMEOUT",
	"E_JS_RELAY",
	"E_CHROME_PERMISSION",
	"E_CONTENT_SCRIPT",
	"E_PROTOCOL",
	"E_AGENT_RUN",
	"E_UNKNOWN",
	"agent_error",
]);

function isBrowsergentErrorCode(value: string): value is BrowsergentErrorCode {
	return VALID_ERROR_CODES.has(value);
}

declare const self: DedicatedWorkerGlobalScope;

let agentLoop: AgentLoop | null = null;
let currentRunId: string | null = null;

function post(message: WorkerToPanel): void {
	self.postMessage(message);
}

// --- Extension-js relay ---

let extjsRelayCounter = 0;
const EXTJS_RELAY_TIMEOUT_MS = 30_000;
const pendingExtjsRelays = new Map<
	string,
	{
		resolve: (result: CellResult) => void;
		reject: (error: Error) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

function rejectAllPendingExtjsRelays(reason: string): void {
	for (const [id, entry] of pendingExtjsRelays) {
		clearTimeout(entry.timeoutId);
		entry.reject(new Error(reason));
		pendingExtjsRelays.delete(id);
	}
}

const pendingExtjsDocsRelays = new Map<
	string,
	{
		resolve: (docs: string) => void;
		reject: (error: Error) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

function rejectAllPendingExtjsDocsRelays(reason: string): void {
	for (const [id, entry] of pendingExtjsDocsRelays) {
		clearTimeout(entry.timeoutId);
		entry.reject(new Error(reason));
		pendingExtjsDocsRelays.delete(id);
	}
}

/** Send JS code to the side panel for execution via ExtensionSession. */
function relayExtjsExecution(code: string): Promise<CellResult> {
	const relayId = `extjs-${++extjsRelayCounter}`;

	const promise = new Promise<CellResult>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingExtjsRelays.delete(relayId);
			reject(
				new Error(`Extjs relay timed out after ${EXTJS_RELAY_TIMEOUT_MS}ms`),
			);
		}, EXTJS_RELAY_TIMEOUT_MS);

		pendingExtjsRelays.set(relayId, { resolve, reject, timeoutId });
	});

	post({ type: "extjsRunRequest", id: relayId, code });
	return promise;
}

/** Send docs request to the side panel via ExtensionSession.apiDocs(). */
function relayExtjsDocs(format: "json" | "markdown"): Promise<string> {
	const relayId = `extjs-docs-${++extjsRelayCounter}`;

	const promise = new Promise<string>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingExtjsDocsRelays.delete(relayId);
			reject(
				new Error(
					`Extjs docs relay timed out after ${EXTJS_RELAY_TIMEOUT_MS}ms`,
				),
			);
		}, EXTJS_RELAY_TIMEOUT_MS);

		pendingExtjsDocsRelays.set(relayId, { resolve, reject, timeoutId });
	});

	post({ type: "extjsDocsRequest", id: relayId, format });
	return promise;
}

function handleExtjsRelayResult(id: string, result: CellResult): void {
	const entry = pendingExtjsRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingExtjsRelays.delete(id);
		entry.resolve(result);
	}
}

function handleExtjsRelayError(id: string, error: string): void {
	const entry = pendingExtjsRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingExtjsRelays.delete(id);
		entry.reject(new Error(error));
	}
}

function handleExtjsDocsRelayResult(id: string, docs: string): void {
	const entry = pendingExtjsDocsRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingExtjsDocsRelays.delete(id);
		entry.resolve(docs);
	}
}

function handleExtjsDocsRelayError(id: string, error: string): void {
	const entry = pendingExtjsDocsRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingExtjsDocsRelays.delete(id);
		entry.reject(new Error(error));
	}
}

// --- Agent handling ---

function postIfCurrentRun(runId: string, message: WorkerToPanel): void {
	if (runId === currentRunId) {
		post(message);
	}
}

function handleAgentStart(
	sessionId: string,
	task: string,
	settings: WorkerSettings,
	runId: string,
): void {
	currentRunId = runId;

	if (!settings.anthropicApiKey) {
		post({
			type: "agentError",
			runId,
			error: {
				code: "E_NO_API_KEY",
				message: "Set your Anthropic API key in settings",
			},
		});
		return;
	}

	if (agentLoop) {
		agentLoop.stop();
	}

	agentLoop = new AgentLoop();

	const config: AnthropicConfig = {
		apiKey: settings.anthropicApiKey,
		baseUrl: settings.baseUrl,
		model: settings.model,
	};

	agentLoop
		.run(sessionId, task, config, {
			onStatus(status, reason) {
				postIfCurrentRun(runId, {
					type: "agentStatus",
					runId,
					status,
					reason,
				});
			},
			onMessage(kind, text, id) {
				postIfCurrentRun(runId, {
					type: "agentMessage",
					runId,
					message: {
						kind,
						id: id ?? crypto.randomUUID(),
						text,
						timestamp: Date.now(),
					},
				});
			},
			onTextDelta(messageId, text) {
				streamLog("worker.post_delta", {
					msgId: messageId.slice(0, 8),
					len: text.length,
				});
				postIfCurrentRun(runId, {
					type: "agentTextDelta",
					runId,
					messageId,
					text,
				});
			},
			onMessageEnd(messageId) {
				postIfCurrentRun(runId, {
					type: "agentMessageEnd",
					runId,
					messageId,
				});
			},
			onTrace(entry: AgentTraceEntry) {
				postIfCurrentRun(runId, { type: "agentTrace", runId, entry });
			},
			onDiagnostic(event) {
				postIfCurrentRun(runId, { type: "agentDiagnostic", runId, event });
			},
			onError(code, message) {
				postIfCurrentRun(runId, {
					type: "agentError",
					runId,
					error: {
						code: isBrowsergentErrorCode(code) ? code : "E_UNKNOWN",
						message,
					},
				});
			},
			runJs(code) {
				return relayExtjsExecution(code);
			},
			getDocs(format) {
				return relayExtjsDocs(format);
			},
		})
		.catch((err) => {
			if (runId === currentRunId) {
				post({
					type: "agentError",
					runId,
					error: {
						code: "E_AGENT_RUN",
						message: err instanceof Error ? err.message : String(err),
					},
				});
			}
		});
}

function handleAgentStop(runId?: string): void {
	if (runId && runId !== currentRunId) {
		return;
	}
	try {
		agentLoop?.stop();
	} catch {
		// ignore
	}
	const stoppedRunId = currentRunId ?? "unknown";
	currentRunId = null; // prevent late agent callbacks from overwriting the stopped status
	post({
		type: "agentStatus",
		runId: stoppedRunId,
		status: "stopped",
		reason: "Stopped by user",
	});
	rejectAllPendingExtjsRelays("Agent stopped");
	rejectAllPendingExtjsDocsRelays("Agent stopped");
}

function handleAgentReset(): void {
	agentLoop?.reset();
	rejectAllPendingExtjsRelays("Agent reset");
	rejectAllPendingExtjsDocsRelays("Agent reset");
	agentLoop = null;
	post({ type: "agentStatus", runId: "unknown", status: "idle" });
}

// --- Standalone extension-js tab handling ---

async function handleExtjsRun(id: string, code: string): Promise<void> {
	try {
		const result = await relayExtjsExecution(code);
		const output =
			result.status === "err"
				? formatError(result.error)
				: result.stdout.join("\n");
		post({ type: "extjsOutput", id, output });
	} catch (err) {
		post({
			type: "extjsError",
			id,
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

// --- Message dispatch ---

self.onmessage = (event: MessageEvent<PanelToWorker>) => {
	const msg = event.data;
	switch (msg.type) {
		case "agentStart":
			handleAgentStart(msg.sessionId, msg.task, msg.settings, msg.runId);
			break;
		case "agentStop":
			handleAgentStop(msg.runId);
			break;
		case "agentReset":
			handleAgentReset();
			break;
		case "extjsRun":
			void handleExtjsRun(msg.id, msg.code);
			break;
		case "extjsStop":
			rejectAllPendingExtjsRelays("Extjs stopped");
			rejectAllPendingExtjsDocsRelays("Extjs stopped");
			break;
		case "extjsReset":
			rejectAllPendingExtjsRelays("Extjs reset");
			rejectAllPendingExtjsDocsRelays("Extjs reset");
			break;
		case "extjsRunResult":
			handleExtjsRelayResult(msg.id, msg.result);
			break;
		case "extjsRunError":
			handleExtjsRelayError(msg.id, msg.error);
			break;
		case "extjsDocsResult":
			handleExtjsDocsRelayResult(msg.id, msg.docs);
			break;
		case "extjsDocsError":
			handleExtjsDocsRelayError(msg.id, msg.error);
			break;
	}
};

// Signal ready
post({ type: "workerReady" });
