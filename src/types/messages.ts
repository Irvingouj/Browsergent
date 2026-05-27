/** Panel <-> Worker message types. */

import type { CellResult } from "./extension-lua";

// --- Panel -> Worker ---

export type PanelToWorker =
	| { type: "agentStart"; task: string }
	| { type: "agentStop" }
	| { type: "agentReset" }
	| { type: "settingsUpdated"; settings: WorkerSettings }
	| { type: "luaRun"; id: string; code: string }
	| { type: "luaStop" }
	| { type: "luaReset" }
	| { type: "luaRunResult"; id: string; result: CellResult }
	| { type: "luaRunError"; id: string; error: string };

export interface WorkerSettings {
	anthropicApiKey?: string;
	baseUrl?: string;
	model: string;
}

// --- Worker -> Panel ---

export type WorkerToPanel =
	| { type: "workerReady" }
	| { type: "agentStatus"; status: AgentStatus; reason?: string }
	| { type: "agentMessage"; message: ChatMessage }
	| { type: "agentTextDelta"; messageId: string; text: string }
	| { type: "agentTrace"; entry: AgentTraceEntry }
	| { type: "agentError"; error: BrowsergentError }
	| { type: "luaOutput"; id: string; output: string }
	| { type: "luaError"; id: string; error: string }
	| { type: "luaRunRequest"; id: string; code: string };

// --- Agent Status ---

export type AgentStatus =
	| "idle"
	| "loading"
	| "running"
	| "waiting_for_model"
	| "executing_tool"
	| "done"
	| "stopped"
	| "error";

// --- Chat Messages ---

export type ChatMessage =
	| { kind: "user"; id: string; text: string; timestamp: number }
	| { kind: "assistant"; id: string; text: string; timestamp: number }
	| { kind: "system"; id: string; text: string; timestamp: number };

// --- Trace ---

export interface AgentTraceEntry {
	id: string;
	step: number;
	status: "running" | "done" | "error";
	toolName: string;
	toolInput?: string;
	result?: string;
	timestamp: number;
}

// --- Error ---

export interface BrowsergentError {
	code: string;
	message: string;
	details?: Record<string, unknown>;
}
