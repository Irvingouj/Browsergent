/** Panel <-> Worker message types. */

import type { PersistData } from "@pi-oxide/pi-host-web/raw";
import type { BrowsergentError } from "../errors/browsergent-error";
import type { LuaRunResult } from "./lua-utils";

export type { BrowsergentError };
export type { PersistData };

// --- Panel -> Worker ---

export type ConversationMessage = {
	role: "user" | "assistant";
	content: string;
};

export type PanelToWorker =
	| {
			type: "agentStart";
			runId: string;
			task: string;
			settings: WorkerSettings;
			priorMessages?: ConversationMessage[];
			priorPersistData?: PersistData;
	  }
	| { type: "agentStop"; runId?: string }
	| { type: "agentReset" }
	| { type: "luaRun"; id: string; code: string }
	| { type: "luaStop" }
	| { type: "luaReset" }
	| { type: "luaRunResult"; id: string; result: LuaRunResult }
	| { type: "luaRunError"; id: string; error: string };

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
	| { type: "agentError"; runId: string; error: BrowsergentError }
	| { type: "agentHistory"; runId: string; messages: ConversationMessage[] }
	| { type: "agentPersistData"; runId: string; persistData: PersistData }
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
