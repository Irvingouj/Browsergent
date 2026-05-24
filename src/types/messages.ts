/** Panel <-> Worker message types. */

import type { BrowserCommand, BrowserResult } from "./browser";

// --- Panel -> Worker ---

export type PanelToWorker =
  | { type: "agentStart"; task: string; maxSteps: number }
  | { type: "agentStop" }
  | { type: "agentReset" }
  | { type: "settingsUpdated"; settings: WorkerSettings }
  | { type: "luaRun"; id: string; code: string; stdin?: string }
  | { type: "luaStop" }
  | { type: "luaReset" };

export interface WorkerSettings {
  anthropicApiKey?: string;
  model: string;
}

// --- Worker -> Panel ---

export type WorkerToPanel =
  | { type: "workerReady" }
  | { type: "agentStatus"; status: AgentStatus; reason?: string }
  | { type: "agentMessage"; message: ChatMessage }
  | { type: "agentTextDelta"; messageId: string; text: string }
  | { type: "agentTrace"; entry: ActionTraceEntry }
  | { type: "agentError"; error: BrowsergentError }
  | { type: "luaOutput"; id: string; output: string }
  | { type: "luaTrace"; entry: ActionTraceEntry }
  | { type: "luaError"; id: string; error: string };

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

export interface ActionTraceEntry {
  id: string;
  step: number;
  status: "running" | "done" | "error";
  command: BrowserCommand;
  result?: BrowserResult;
  timestamp: number;
}

// --- Error ---

export interface BrowsergentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
