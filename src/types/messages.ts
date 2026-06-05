/** Panel <-> Worker message types. */

import type { BrowsergentError } from "../errors/browsergent-error";
import type { JsRunResult } from "./js-utils";

export type { BrowsergentError };

// --- Panel -> Worker ---

export type PanelToWorker =
	| {
			type: "agentStart";
			runId: string;
			sessionId: string;
			task: string;
			settings: WorkerSettings;
	  }
	| { type: "agentStop"; runId?: string }
	| { type: "agentReset" }
	| { type: "jsRun"; id: string; code: string }
	| { type: "jsStop" }
	| { type: "jsReset" }
	| { type: "jsRunResult"; id: string; result: JsRunResult }
	| { type: "jsRunError"; id: string; error: string };

export interface WorkerSettings {
	anthropicApiKey?: string;
	baseUrl?: string;
	model: string;
}

// --- Worker -> Panel ---

export type WorkerToPanel =
	| { type: "workerReady" }
	| { type: "agentStatus"; runId: string; status: AgentStatus; reason?: string }
	| { type: "agentMessage"; runId: string; message: ChatMessage }
	| { type: "agentTextDelta"; runId: string; messageId: string; text: string }
	| { type: "agentTrace"; runId: string; entry: AgentTraceEntry }
	| { type: "agentMessageEnd"; runId: string; messageId: string }
	| { type: "agentError"; runId: string; error: BrowsergentError }
	| { type: "jsOutput"; id: string; output: string }
	| { type: "jsError"; id: string; error: string }
	| { type: "jsRunRequest"; id: string; code: string };

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
