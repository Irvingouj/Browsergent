/**
 * Web Worker entry point.
 * Owns agent loop state, WASM loading, and message routing.
 *
 * The Worker never touches chrome.* APIs directly.
 * All JS execution is relayed to the main thread via postMessage,
 * where ExtensionSession (from @pi-oxide/extension-js) runs.
 */

/// <reference lib="webworker" />

import type { LuaRunResult } from "../types/lua-utils";
import { formatError } from "../types/lua-utils";
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

// --- Lua relay ---

let luaRelayCounter = 0;
const LUA_RELAY_TIMEOUT_MS = 30_000;
const pendingLuaRelays = new Map<
	string,
	{
		resolve: (result: LuaRunResult) => void;
		reject: (error: Error) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

function rejectAllPendingLuaRelays(reason: string): void {
	for (const [id, entry] of pendingLuaRelays) {
		clearTimeout(entry.timeoutId);
		entry.reject(new Error(reason));
		pendingLuaRelays.delete(id);
	}
}

/** Send Lua code to the side panel for execution via ExtensionSession. */
function relayLuaExecution(code: string): Promise<LuaRunResult> {
	const relayId = `lua-${++luaRelayCounter}`;

	const promise = new Promise<LuaRunResult>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingLuaRelays.delete(relayId);
			reject(new Error(`Lua relay timed out after ${LUA_RELAY_TIMEOUT_MS}ms`));
		}, LUA_RELAY_TIMEOUT_MS);

		pendingLuaRelays.set(relayId, { resolve, reject, timeoutId });
	});

	post({ type: "luaRunRequest", id: relayId, code });
	return promise;
}

function handleLuaRelayResult(id: string, result: LuaRunResult): void {
	const entry = pendingLuaRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingLuaRelays.delete(id);
		entry.resolve(result);
	}
}

function handleLuaRelayError(id: string, error: string): void {
	const entry = pendingLuaRelays.get(id);
	if (entry) {
		clearTimeout(entry.timeoutId);
		pendingLuaRelays.delete(id);
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
			runLua(code) {
				return relayLuaExecution(code);
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
	rejectAllPendingLuaRelays("Agent stopped");
}

function handleAgentReset(): void {
	agentLoop?.reset();
	rejectAllPendingLuaRelays("Agent reset");
	agentLoop = null;
	post({ type: "agentStatus", runId: "unknown", status: "idle" });
}

// --- Standalone Lua tab handling ---

async function handleLuaRun(id: string, code: string): Promise<void> {
	try {
		const result = await relayLuaExecution(code);
		const output =
			result.status === "err"
				? formatError(result.error)
				: result.stdout.join("\n");
		post({ type: "luaOutput", id, output });
	} catch (err) {
		post({
			type: "luaError",
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
		case "luaRun":
			void handleLuaRun(msg.id, msg.code);
			break;
		case "luaStop":
			rejectAllPendingLuaRelays("Lua stopped");
			break;
		case "luaReset":
			rejectAllPendingLuaRelays("Lua reset");
			break;
		case "luaRunResult":
			handleLuaRelayResult(msg.id, msg.result);
			break;
		case "luaRunError":
			handleLuaRelayError(msg.id, msg.error);
			break;
	}
};

// Signal ready
post({ type: "workerReady" });
