/**
 * Agent loop: drives the pi-core WASM agent through LLM calls and tool execution.
 *
 * For v1, we bypass pi-core WASM and implement a simpler direct Anthropic loop.
 * The WASM integration will be added once the build pipeline is set up.
 */

import type { BrowserCommand, BrowserResult } from "../types/browser";
import type { ActionTraceEntry, AgentStatus } from "../types/messages";
import {
  callAnthropic,
  mapToolToCommand,
  formatToolResult,
  type AnthropicConfig,
} from "./anthropic";

export interface AgentLoopCallbacks {
  onStatus: (status: AgentStatus, reason?: string) => void;
  onMessage: (kind: "user" | "assistant" | "system", text: string) => void;
  onTrace: (entry: ActionTraceEntry) => void;
  onError: (code: string, message: string) => void;
  executeCommand: (command: BrowserCommand) => Promise<BrowserResult>;
}

export class AgentLoop {
  private aborted = false;
  private abortController: AbortController | null = null;

  async run(task: string, maxSteps: number, config: AnthropicConfig, callbacks: AgentLoopCallbacks): Promise<void> {
    this.aborted = false;
    this.abortController = new AbortController();

    callbacks.onStatus("running");
    callbacks.onMessage("user", task);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: task },
    ];

    let step = 0;

    try {
      while (step < maxSteps && !this.aborted) {
        callbacks.onStatus("waiting_for_model");
        const result = await callAnthropic(messages, config, this.abortController.signal);

        if (this.aborted) break;

        if (result.text) {
          callbacks.onMessage("assistant", result.text);
        }

        if (result.stopReason === "end_turn" || result.toolCalls.length === 0) {
          break;
        }

        callbacks.onStatus("executing_tool");

        // Build tool results for next message
        const toolResultParts: string[] = [];

        for (const tc of result.toolCalls) {
          if (this.aborted) break;

          step++;
          const command = mapToolToCommand(tc.name, tc.arguments);
          const traceId = crypto.randomUUID();
          const timestamp = Date.now();

          callbacks.onTrace({
            id: traceId,
            step,
            status: "running",
            command,
            timestamp,
          });

          const browserResult = await callbacks.executeCommand(command);

          callbacks.onTrace({
            id: traceId,
            step,
            status: browserResult.ok ? "done" : "error",
            command,
            result: browserResult,
            timestamp: Date.now(),
          });

          if (browserResult.ok) {
            toolResultParts.push(
              `[Tool: ${tc.name}]\n${formatToolResult(command, browserResult.value)}`
            );
          } else {
            toolResultParts.push(
              `[Tool: ${tc.name}] ERROR: ${browserResult.error} (${browserResult.code})`
            );
          }
        }

        // Feed tool results back as a user message
        messages.push({
          role: "assistant",
          content: result.text || "[executing tools...]",
        });
        messages.push({
          role: "user",
          content: toolResultParts.join("\n\n"),
        });
      }

      if (this.aborted) {
        callbacks.onStatus("stopped", "Stopped by user");
      } else if (step >= maxSteps) {
        callbacks.onStatus("stopped", `Max steps reached (${maxSteps})`);
      } else {
        callbacks.onStatus("done");
      }
    } catch (err) {
      if (this.aborted) {
        callbacks.onStatus("stopped", "Stopped by user");
      } else {
        const message = err instanceof Error ? err.message : String(err);
        callbacks.onError("agent_error", message);
        callbacks.onStatus("error", message);
      }
    }
  }

  stop(): void {
    this.aborted = true;
    this.abortController?.abort();
  }
}
