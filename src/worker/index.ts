/**
 * Web Worker entry point.
 * Owns agent loop state, WASM loading, and message routing.
 */

/// <reference lib="webworker" />

import type { PanelToWorker, WorkerToPanel, ActionTraceEntry } from "../types/messages";
import type { BrowserCommand, BrowserResult } from "../types/browser";
import { AgentLoop } from "./agent-loop";
import type { AnthropicConfig } from "./anthropic";

declare const self: DedicatedWorkerGlobalScope;

let agentLoop: AgentLoop | null = null;
let currentApiKey: string | undefined;
let currentModel = "claude-sonnet-4-20250514";

function post(message: WorkerToPanel): void {
  self.postMessage(message);
}

async function executeBrowserCommand(command: BrowserCommand): Promise<BrowserResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "browserCommand", command },
      (response: { type: "commandResult"; result: BrowserResult }) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message ?? "Browser command failed",
            code: "E_UNKNOWN",
          });
          return;
        }
        resolve(response.result);
      },
    );
  });
}

function handleAgentStart(task: string, maxSteps: number): void {
  if (!currentApiKey) {
    post({ type: "agentError", error: { code: "no_api_key", message: "Set your Anthropic API key in settings" } });
    return;
  }

  if (agentLoop) {
    agentLoop.stop();
  }

  agentLoop = new AgentLoop();

  const config: AnthropicConfig = {
    apiKey: currentApiKey,
    model: currentModel,
  };

  agentLoop.run(task, maxSteps, config, {
    onStatus(status, reason) {
      post({ type: "agentStatus", status, reason });
    },
    onMessage(kind, text) {
      post({
        type: "agentMessage",
        message: { kind, id: crypto.randomUUID(), text, timestamp: Date.now() },
      });
    },
    onTrace(entry: ActionTraceEntry) {
      post({ type: "agentTrace", entry });
    },
    onError(code, message) {
      post({ type: "agentError", error: { code, message } });
    },
    executeCommand(command: BrowserCommand) {
      return executeBrowserCommand(command);
    },
  });
}

function handleAgentStop(): void {
  agentLoop?.stop();
}

function handleAgentReset(): void {
  agentLoop?.stop();
  agentLoop = null;
  post({ type: "agentStatus", status: "idle" });
}

function handleSettingsUpdated(settings: { anthropicApiKey?: string; model: string }): void {
  currentApiKey = settings.anthropicApiKey;
  currentModel = settings.model;
}

// --- Lua handling (stub for now, full impl in M5.5) ---

function handleLuaRun(id: string, code: string): void {
  // Will be implemented with piccolo WASM integration
  post({ type: "luaError", id, error: "Lua runtime not yet available" });
}

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
      handleLuaRun(msg.id, msg.code);
      break;
    case "luaStop":
      // Will be implemented with piccolo
      break;
    case "luaReset":
      // Will be implemented with piccolo
      break;
  }
};

// Signal ready
post({ type: "workerReady" });
