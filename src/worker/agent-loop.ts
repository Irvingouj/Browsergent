/**
 * Agent loop: drives pi-core WASM through LLM calls and Lua tool execution.
 *
 * The LLM has ONE tool: run_lua. It generates Lua code.
 * AgentLoop delegates execution to LuaRuntime, which runs the Lua code
 * and yields BrowserCommands through the content script path.
 */

import type { BrowserCommand, BrowserResult } from "../types/browser";
import type { ActionTraceEntry, AgentStatus } from "../types/messages";
import {
  callAnthropic,
  type AnthropicConfig,
  type AnthropicCallResult,
} from "./anthropic";
import {
  initWasm,
  wasmCreateAgent,
  wasmDestroyAgent,
  wasmOnLlmDone,
  wasmOnToolDone,
  wasmPrompt,
} from "./wasm-bridge";
import { LuaRuntime, type LuaCallbacks } from "./lua-runtime";

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type AgentAction =
  | { type: "stream_llm"; context: unknown; session_id?: string | null }
  | { type: "execute_tools"; calls: ToolCall[] }
  | { type: "finished"; messages: unknown[] }
  | { type: "wait_for_input"; mode: string }
  | { type: "cancel_tools"; tool_call_ids: string[]; reason: unknown };

interface StepOutput {
  events: unknown[];
  actions: AgentAction[];
}

export interface AgentLoopCallbacks {
  onStatus: (status: AgentStatus, reason?: string) => void;
  onMessage: (kind: "user" | "assistant" | "system", text: string) => void;
  onTextDelta?: (messageId: string, text: string) => void;
  onTrace: (entry: ActionTraceEntry) => void;
  onError: (code: string, message: string) => void;
  executeCommand: (command: BrowserCommand) => Promise<BrowserResult>;
}

const RUN_LUA_TOOL = {
  name: "run_lua",
  label: "Run Lua",
  description: "Execute Lua code to control the browser via page.* API.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "Lua code to execute" },
    },
    required: ["code"],
  },
  execution_mode: "sequential" as const,
};

const SYSTEM_PROMPT = "You are Browsergent. Use run_lua to execute Lua code that calls page.snapshot() before acting. Use ref_ids from snapshots. Show clear progress and report what happened.";

export class AgentLoop {
  private aborted = false;
  private abortController: AbortController | null = null;
  private handle: number | null = null;
  private luaRuntime: LuaRuntime | null = null;

  async run(
    task: string,
    maxSteps: number,
    config: AnthropicConfig,
    callbacks: AgentLoopCallbacks,
    priorMessages: Array<{ role: "user" | "assistant"; content: string }> = [],
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    this.aborted = false;
    this.abortController = new AbortController();

    callbacks.onStatus("loading");
    await initWasm();
    this.handle = wasmCreateAgent({
      system_prompt: SYSTEM_PROMPT,
      model: {
        id: config.model,
        name: config.model,
        api: "anthropic",
        provider: "anthropic",
        reasoning: false,
        context_window: 200000,
        max_tokens: 4096,
        capabilities: { vision: false, json_mode: false, function_calling: true, streaming: true },
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      },
      thinking_level: "off",
      tools: [RUN_LUA_TOOL],
      tool_execution_mode: "sequential",
    });

    this.luaRuntime = new LuaRuntime();
    await this.luaRuntime.init();

    callbacks.onStatus("running");
    callbacks.onMessage("user", task);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...priorMessages,
      { role: "user", content: task },
    ];

    try {
      const firstStep = wasmPrompt(this.handle, task) as StepOutput;
      await this.processActions(firstStep.actions, messages, maxSteps, config, callbacks, { count: 0 });
      if (!this.aborted) callbacks.onStatus("done");
    } catch (err) {
      if (this.aborted) {
        callbacks.onStatus("stopped", "Stopped by user");
      } else {
        const message = err instanceof Error ? err.message : String(err);
        callbacks.onError("agent_error", message);
        callbacks.onStatus("error", message);
      }
    } finally {
      if (this.handle !== null) {
        wasmDestroyAgent(this.handle);
        this.handle = null;
      }
      this.luaRuntime = null;
    }

    return messages;
  }

  stop(): void {
    this.aborted = true;
    this.abortController?.abort();
    this.luaRuntime?.stop();
  }

  private async processActions(
    actions: AgentAction[],
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    maxSteps: number,
    config: AnthropicConfig,
    callbacks: AgentLoopCallbacks,
    step: { count: number },
  ): Promise<void> {
    for (const action of actions) {
      if (this.aborted) return;
      if (step.count >= maxSteps) {
        callbacks.onStatus("stopped", `Max steps reached (${maxSteps})`);
        this.aborted = true;
        return;
      }

      switch (action.type) {
        case "stream_llm": {
          callbacks.onStatus("waiting_for_model");
          const messageId = crypto.randomUUID();
          let partialText = "";

          try {
            const result = await callAnthropic(
              messages,
              config,
              this.abortController?.signal,
              (delta) => {
                partialText += delta;
                callbacks.onTextDelta?.(messageId, delta);
              },
            );
            messages.push({ role: "assistant", content: result.text || "[tool use]" });
            const output = wasmOnLlmDone(this.requireHandle(), this.toLlmResult(result, config)) as StepOutput;
            await this.processActions(output.actions, messages, maxSteps, config, callbacks, step);
          } catch (err) {
            if (this.aborted && partialText) {
              messages.push({ role: "assistant", content: partialText });
            }
            throw err;
          }
          break;
        }
        case "execute_tools": {
          callbacks.onStatus("executing_tool");
          for (const call of action.calls) {
            if (this.aborted) return;
            step.count++;

            const luaOutput = await this.executeLuaTool(call, callbacks);

            const toolPayload = luaOutput.ok
              ? { content: [{ type: "text", text: luaOutput.text }] }
              : { error: { code: "lua_error", message: luaOutput.text } };
            const output = wasmOnToolDone(this.requireHandle(), call.id, toolPayload) as StepOutput;
            messages.push({
              role: "user",
              content: luaOutput.ok
                ? `[run_lua]\n${luaOutput.text}`
                : `[run_lua] ERROR: ${luaOutput.text}`,
            });
            await this.processActions(output.actions, messages, maxSteps, config, callbacks, step);
          }
          break;
        }
        case "finished":
        case "wait_for_input":
        case "cancel_tools":
          return;
      }
    }
  }

  private async executeLuaTool(
    call: ToolCall,
    callbacks: AgentLoopCallbacks,
  ): Promise<{ ok: boolean; text: string }> {
    if (call.name !== "run_lua") {
      return { ok: false, text: `Unknown tool: ${call.name}` };
    }

    const code = call.arguments["code"];
    if (typeof code !== "string" || !code.trim()) {
      return { ok: false, text: "run_lua requires a non-empty 'code' string argument" };
    }

    if (!this.luaRuntime) {
      return { ok: false, text: "Lua runtime not initialized" };
    }

    const outputParts: string[] = [];

    const luaCallbacks: LuaCallbacks = {
      onOutput(text: string) {
        outputParts.push(text);
      },
      onTrace(entry: ActionTraceEntry) {
        callbacks.onTrace(entry);
      },
      executeCommand(command: BrowserCommand) {
        return callbacks.executeCommand(command);
      },
    };

    try {
      await this.luaRuntime.run(code, luaCallbacks);
      return { ok: true, text: outputParts.join("") || "(Lua executed successfully, no output)" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, text: msg };
    }
  }

  private toLlmResult(result: AnthropicCallResult, config: AnthropicConfig): unknown {
    return {
      Ok: {
        content: [
          ...(result.text ? [{ type: "text", text: result.text }] : []),
          ...result.toolCalls.map((call) => ({
            type: "tool_call",
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          })),
        ],
        api: "anthropic",
        provider: "anthropic",
        model: config.model,
        stop_reason: result.stopReason,
        error_message: null,
        timestamp: Date.now(),
        usage: { input: 0, output: 0, cache_read: 0, cache_write: 0, total_tokens: 0 },
      },
    };
  }

  private requireHandle(): number {
    if (this.handle === null) throw new Error("Agent WASM handle is not initialized");
    return this.handle;
  }
}
