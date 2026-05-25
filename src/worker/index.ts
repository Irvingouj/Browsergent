/**
 * Web Worker entry point.
 * Owns agent loop state, WASM loading, and message routing.
 *
 * The Worker never touches chrome.* APIs directly.
 * All Lua execution is relayed to the main thread via postMessage,
 * where ExtensionSession (from @pi-oxide/extension-lua) runs.
 */

/// <reference lib="webworker" />

import type { CellResult } from "../types/extension-lua";
import { formatError } from "../types/extension-lua";
import type {
	AgentTraceEntry,
	PanelToWorker,
	WorkerToPanel,
} from "../types/messages";
import { AgentLoop } from "./agent-loop";
import type { AnthropicConfig } from "./anthropic";

declare const self: DedicatedWorkerGlobalScope;

let agentLoop: AgentLoop | null = null;
let currentApiKey: string | undefined;
let currentBaseUrl: string | undefined;
let currentModel = "claude-sonnet-4-20250514";
let conversationHistory: Array<{
	role: "user" | "assistant";
	content: string;
}> = [];
let agentRunId = 0;

function post(message: WorkerToPanel): void {
	self.postMessage(message);
}

// --- Lua relay ---

let luaRelayCounter = 0;
const LUA_RELAY_TIMEOUT_MS = 30_000;
const pendingLuaRelays = new Map<
	string,
	{
		resolve: (result: CellResult) => void;
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
function relayLuaExecution(code: string): Promise<CellResult> {
	const relayId = `lua-${++luaRelayCounter}`;

	const promise = new Promise<CellResult>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingLuaRelays.delete(relayId);
			reject(new Error(`Lua relay timed out after ${LUA_RELAY_TIMEOUT_MS}ms`));
		}, LUA_RELAY_TIMEOUT_MS);

		pendingLuaRelays.set(relayId, { resolve, reject, timeoutId });
	});

	post({ type: "luaRunRequest", id: relayId, code });
	return promise;
}

function handleLuaRelayResult(id: string, result: CellResult): void {
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

function handleAgentStart(task: string, maxSteps: number): void {
	if (!currentApiKey) {
		post({
			type: "agentError",
			error: {
				code: "no_api_key",
				message: "Set your Anthropic API key in settings",
			},
		});
		return;
	}

	if (agentLoop) {
		agentLoop.stop();
	}

	agentLoop = new AgentLoop();
	const runId = ++agentRunId;

	const config: AnthropicConfig = {
		apiKey: currentApiKey,
		baseUrl: currentBaseUrl,
		model: currentModel,
	};

	agentLoop
		.run(
			task,
			maxSteps,
			config,
			{
				onStatus(status, reason) {
					post({ type: "agentStatus", status, reason });
				},
				onMessage(kind, text) {
					post({
						type: "agentMessage",
						message: {
							kind,
							id: crypto.randomUUID(),
							text,
							timestamp: Date.now(),
						},
					});
				},
				onTextDelta(messageId, text) {
					post({ type: "agentTextDelta", messageId, text });
				},
				onTrace(entry: AgentTraceEntry) {
					post({ type: "agentTrace", entry });
				},
				onError(code, message) {
					post({ type: "agentError", error: { code, message } });
				},
				runLua(code) {
					return relayLuaExecution(code);
				},
			},
			conversationHistory,
		)
		.then((finalMessages) => {
			if (runId === agentRunId) {
				conversationHistory = finalMessages;
			}
		});
}

function handleAgentStop(): void {
	agentLoop?.stop();
	rejectAllPendingLuaRelays("Agent stopped");
}

function handleAgentReset(): void {
	agentLoop?.stop();
	rejectAllPendingLuaRelays("Agent reset");
	agentLoop = null;
	conversationHistory = [];
	post({ type: "agentStatus", status: "idle" });
}

function handleSettingsUpdated(settings: {
	anthropicApiKey?: string;
	baseUrl?: string;
	model: string;
}): void {
	currentApiKey = settings.anthropicApiKey;
	currentBaseUrl = settings.baseUrl;
	currentModel = settings.model;
}

// --- Standalone Lua tab handling ---

async function handleLuaRun(id: string, code: string): Promise<void> {
	try {
		const result = await relayLuaExecution(code);
		const output = result.error
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
			handleAgentStart(msg.task, msg.maxSteps);
			break;
		case "agentStop":
			handleAgentStop();
			break;
		case "agentReset":
			handleAgentReset();
			break;
		case "settingsUpdated":
			handleSettingsUpdated(msg.settings);
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
