/**
 * Web Worker entry point.
 * Owns agent loop state, WASM loading, and message routing.
 *
 * Browser commands go through chrome.runtime.sendMessage when available,
 * or fall back to a main-thread relay via postMessage.
 */

/// <reference lib="webworker" />

import type { PanelToWorker, WorkerToPanel, ActionTraceEntry } from "../types/messages";
import type { BrowserCommand, BrowserResult } from "../types/browser";
import { AgentLoop } from "./agent-loop";
import type { AnthropicConfig } from "./anthropic";
import { LuaRuntime } from "./lua-runtime";

declare const self: DedicatedWorkerGlobalScope;

let agentLoop: AgentLoop | null = null;
let luaRuntime: LuaRuntime | null = null;
let currentApiKey: string | undefined;
let currentBaseUrl: string | undefined;
let currentModel = "claude-sonnet-4-20250514";
let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
let agentRunId = 0;

function post(message: WorkerToPanel): void {
  self.postMessage(message);
}

function hasChromeRuntime(): boolean {
  return typeof chrome !== "undefined" && !!chrome?.runtime?.id;
}

async function executeBrowserCommand(command: BrowserCommand): Promise<BrowserResult> {
  if (hasChromeRuntime()) {
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

  // Fallback: relay to main thread via postMessage
  return relayToMainThread<BrowserResult>({ type: "browserCommand", command });
}

let relayCounter = 0;

function relayToMainThread<T>(payload: Record<string, unknown>): Promise<T> {
  const relayId = `relay-${++relayCounter}`;
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "relayResult" && msg.id === relayId) {
        self.removeEventListener("message", handler);
        resolve(msg.result as T);
      }
    };
    self.addEventListener("message", handler);
    post({ type: "relayRequest", id: relayId, payload } as WorkerToPanel);
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
  const runId = ++agentRunId;

  const config: AnthropicConfig = {
    apiKey: currentApiKey,
    baseUrl: currentBaseUrl,
    model: currentModel,
  };

  agentLoop
    .run(task, maxSteps, config, {
      onStatus(status, reason) {
        post({ type: "agentStatus", status, reason });
      },
      onMessage(kind, text) {
        post({
          type: "agentMessage",
          message: { kind, id: crypto.randomUUID(), text, timestamp: Date.now() },
        });
      },
      onTextDelta(messageId, text) {
        post({ type: "agentTextDelta", messageId, text });
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
    }, conversationHistory)
    .then((finalMessages) => {
      if (runId === agentRunId) {
        conversationHistory = finalMessages;
      }
    });
}

function handleAgentStop(): void {
  agentLoop?.stop();
}

function handleAgentReset(): void {
  agentLoop?.stop();
  agentLoop = null;
  conversationHistory = [];
  post({ type: "agentStatus", status: "idle" });
}

function handleSettingsUpdated(settings: { anthropicApiKey?: string; baseUrl?: string; model: string }): void {
  currentApiKey = settings.anthropicApiKey;
  currentBaseUrl = settings.baseUrl;
  currentModel = settings.model;
}

// --- Lua handling ---

async function handleLuaRun(id: string, code: string): Promise<void> {
  try {
    if (!luaRuntime) {
      luaRuntime = new LuaRuntime();
      await luaRuntime.init();
    }
    await luaRuntime.run(code, {
      onOutput(text) {
        post({ type: "luaOutput", id, output: text });
      },
      onTrace(entry) {
        post({ type: "luaTrace", entry });
      },
      executeCommand(command) {
        return executeBrowserCommand(command);
      },
    });
  } catch (err) {
    post({ type: "luaError", id, error: err instanceof Error ? err.message : String(err) });
  }
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
      void handleLuaRun(msg.id, msg.code);
      break;
    case "luaStop":
      luaRuntime?.stop();
      break;
    case "luaReset":
      luaRuntime?.reset();
      break;
  }
};

// Signal ready
post({ type: "workerReady" });
