/** Panel <-> Worker message types. */

import type { BrowsergentError } from "../errors/browsergent-error";
import type { FileOp, FileOpResult } from "../worker/file-op-relay";
import type { CellResult } from "./extjs-utils";

export type { BrowsergentError };

// --- Panel -> Worker ---

export type PanelToWorker =
	| {
			type: "agentStart";
			runId: string;
			sessionId: string;
			task: string;
			resolvedTask?: string;
			skillCatalog?: string;
			activatedSkills?: string[];
			settings: WorkerSettings;
	  }
	| { type: "agentStop"; runId?: string }
	| { type: "agentReset" }
	| { type: "extjsStop" }
	| { type: "extjsReset" }
	| { type: "extjsRunResult"; id: string; result: CellResult }
	| { type: "extjsRunError"; id: string; error: string }
	| { type: "extjsDocsResult"; id: string; docs: string }
	| { type: "extjsDocsError"; id: string; error: string }
	| { type: "loadSkillResult"; id: string; content: string }
	| { type: "loadSkillError"; id: string; error: string }
	| { type: "fileOpResult"; id: string; result: FileOpResult }
	| { type: "fileOpError"; id: string; error: string };

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
	| { type: "agentDiagnostic"; runId: string; event: AgentDiagnosticEvent }
	| { type: "agentMessageEnd"; runId: string; messageId: string }
	| { type: "agentError"; runId: string; error: BrowsergentError }
	| { type: "extjsOutput"; id: string; output: string }
	| { type: "extjsError"; id: string; error: string }
	| { type: "extjsRunRequest"; id: string; code: string }
	| { type: "extjsDocsRequest"; id: string; format: "json" | "markdown" }
	| {
			type: "loadSkillRequest";
			id: string;
			skill: string;
			path?: string;
			activatedSkills?: string[];
	  }
	| { type: "fileOpRequest"; id: string; sessionId: string; op: FileOp };

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

export type DiagnosticContentBlock =
	| { type: "text"; text: string }
	| { type: "tool_call"; id: string; name: string; arguments: unknown }
	| { type: "image"; mimeType: string; data: string }
	| { type: "file"; mimeType: string; data: string };

export interface DiagnosticMessage {
	id: string;
	role: "user" | "assistant" | "tool_result";
	content: DiagnosticContentBlock[];
	timestamp?: number;
	toolCallId?: string;
}

export type AgentDiagnosticEvent =
	| {
			kind: "provider_request";
			timestamp: number;
			body: unknown;
	  }
	| {
			kind: "provider_sse_event";
			timestamp: number;
			eventType: string;
			data: string;
	  }
	| {
			kind: "provider_sse_remainder";
			timestamp: number;
			data: string;
	  }
	| {
			kind: "model_request";
			timestamp: number;
			instructions: string;
			messages: DiagnosticMessage[];
			tools: ReadonlyArray<{
				name: string;
				description: string;
				inputSchema: unknown;
			}>;
	  }
	| {
			kind: "model_response";
			timestamp: number;
			providerStopReason: string;
			sdkStopReason: "end" | "tool_call" | "length" | "error";
			content: DiagnosticContentBlock[];
	  }
	| {
			kind: "agent_status";
			timestamp: number;
			state: string;
			message?: string;
	  }
	| {
			kind: "agent_run_result";
			timestamp: number;
			status: "completed" | "aborted" | "failed";
			text: string;
			toolCalls: ReadonlyArray<{
				id: string;
				name: string;
				input: unknown;
				output?: unknown;
				status: "running" | "completed" | "failed" | "cancelled";
				error?: { code: string; message: string };
			}>;
			error?: { code: string; message: string };
	  };
