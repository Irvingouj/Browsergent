/**
 * Web Worker entry point.
 * Owns agent loop state, WASM loading, and message routing.
 *
 * The Worker never touches chrome.* APIs directly.
 * All JS execution is relayed to the main thread via postMessage,
 * where ExtensionSession (from @pi-oxide/extension-js) runs.
 */

/// <reference lib="webworker" />

import type { JsRunResult } from "../types/js-utils";
import { formatError } from "../types/js-utils";
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

declare const self: DedicatedWorkerGlobalScope;

let agentLoop: AgentLoop | null = null;
let currentRunId: string | null = null;

function post(message: WorkerToPanel): void {
	self.postMessage(message);
}

// --- JS relay ---

let jsRelayCounter = 0;
const JS_RELAY_TIMEOUT_MS = 30_000;
const pendingJsRelays = new Map<
	string,
	{
		resolve: (result: JsRunResult) => void;
		reject: (error: Error) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

function rejectAllPendingJsRelays(reason: string): void {
	for (const [id, entry] of pendingJsRelays) {
		clearTimeout(entry.timeoutId);
		entry.reject(new Error(reason));
		pendingJsRelays.delete(id);
	}
}

/** Send JS code to the side panel for execution via ExtensionSession. */
function relayJsExecution(code: string): Promise<JsRunResult> {
	const relayId = `js-${++jsRelayCounter}`;

	const promise = new Promise<JsRunResult>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingJsRelays.delete(relayId);
			reject(new Error(`JS relay timed out after ${JS_RELAY_TIMEOUT_MS}ms`));
		}, JS_RELAY_TIMEOUT_MS);

		pendingJsRelays.set(relayId, { resolve, reject, timeoutId });
	});

	post({ type: "jsRunRequest", id: relayId, code });
	return promise;
}

function handleJsRelayResult(id: string, result: JsRunResult): void {
	const entry = pendingJsRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingJsRelays.delete(id);
		entry.resolve(result);
	}
}

function handleJsRelayError(id: string, error: string): void {
	const entry = pendingJsRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingJsRelays.delete(id);
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
			onError(code, message) {
				postIfCurrentRun(runId, {
					type: "agentError",
					runId,
					error: {
						code: code as import("../types/messages").BrowsergentError["code"],
						message,
					},
				});
			},
			runJs(code) {
				return relayJsExecution(code);
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
	agentLoop?.stop();
	post({
		type: "agentStatus",
		runId: currentRunId ?? "unknown",
		status: "stopped",
		reason: "Stopped by user",
	});
	rejectAllPendingJsRelays("Agent stopped");
}

function handleAgentReset(): void {
	agentLoop?.reset();
	rejectAllPendingJsRelays("Agent reset");
	agentLoop = null;
	post({ type: "agentStatus", runId: "unknown", status: "idle" });
}

// --- Standalone JS tab handling ---

async function handleJsRun(id: string, code: string): Promise<void> {
	try {
		const result = await relayJsExecution(code);
		const output =
			result.status === "err"
				? formatError(result.error)
				: result.stdout.join("\n");
		post({ type: "jsOutput", id, output });
	} catch (err) {
		post({
			type: "jsError",
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
		case "jsRun":
			void handleJsRun(msg.id, msg.code);
			break;
		case "jsStop":
			rejectAllPendingJsRelays("JS stopped");
			break;
		case "jsReset":
			rejectAllPendingJsRelays("JS reset");
			break;
		case "jsRunResult":
			handleJsRelayResult(msg.id, msg.result);
			break;
		case "jsRunError":
			handleJsRelayError(msg.id, msg.error);
			break;
	}
};

// Signal ready
post({ type: "workerReady" });
