/**
 * High-level JS SDK for @pi-oxide/pi-host-web.
 *
 * Hides WASM loading, numeric handles, and the agent drive-loop.
 * Supports streaming LLM responses and full agent lifecycle.
 *
 * Import from the package root:
 *   import { Agent, toolResult } from "@pi-oxide/pi-host-web";
 */

import {
  createAgent,
  continueTurn,
  destroyAgent,
  feedLlmChunk,
  followUp,
  getSessionState,
  initSync,
  onLlmDone,
  onToolCancelled,
  onToolDone,
  onToolStarted,
  projectContext,
  prompt,
  reset,
  setSessionState,
  state,
  steer,
  default as init,
} from "../pi_host_web.js";

export { projectContext };

let initialized = false;

/** Ensure the WASM module is loaded. Safe to call multiple times. */
export async function ensureInit() {
  if (initialized) return;
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(
      new URL("../pi_host_web_bg.wasm", import.meta.url)
    );
    initSync({ module: bytes });
  } else {
    await init();
  }
  initialized = true;
}

class HostError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "HostError";
  }
}

function unwrap(result) {
  if (!result.ok) {
    throw new HostError(result.error.code, result.error.message);
  }
  return result.data;
}

/** Build a successful tool result payload. */
export function toolResult(text, opts = {}) {
  const payload = {
    content: [{ type: "text", text }],
  };
  if (opts.terminate) {
    payload.terminate = true;
  }
  return payload;
}

/** Build an error tool result payload. */
export function toolError(code, message) {
  return { error: { code, message } };
}

/**
 * High-level agent that manages the WASM handle and drive-loop.
 *
 * Usage:
 *   const agent = await Agent.create(options);
 *   const finalAction = await agent.run("hello", { llm, tools, onEvent });
 *   agent.destroy();
 */
export class Agent {
  /** @type {number} */
  #handle;

  constructor(handle) {
    this.#handle = handle;
  }

  /** Create a new agent. Loads WASM on first call automatically. */
  static async create(options) {
    await ensureInit();
    const result = unwrap(createAgent(options));
    return new Agent(result.handle);
  }

  /**
   * Run one user prompt through the full turn loop.
   *
   * @param {string} promptText
   * @param {object} config
   * @param {LlmProvider} config.llm
   * @param {Record<string, (call: ToolCall) => Promise<ToolResult> | ToolResult>} config.tools
   * @param {(event: AgentEvent) => void} [config.onEvent]
   * @returns {Promise<AgentAction>} terminal action (finished or wait_for_input)
   */
  async run(promptText, config) {
    let step = unwrap(prompt(this.#handle, { text: promptText }));
    for (const event of step.events) {
      config.onEvent?.(event);
    }

    while (true) {
      let actions = step.actions ?? [];
      if (actions.length === 0) {
        return { type: "finished", messages: [] };
      }

      for (const action of actions) {
        switch (action.type) {
          case "stream_llm": {
            const stream = await config.llm.call(action.context);
            for await (const chunk of stream.chunks) {
              const ev = unwrap(feedLlmChunk(this.#handle, chunk));
              for (const e of ev.events) config.onEvent?.(e);
            }
            const result = await stream.result;
            step = unwrap(onLlmDone(this.#handle, result));
            for (const e of step.events) config.onEvent?.(e);
            break;
          }

          case "execute_tools": {
            for (const call of action.calls) {
              const started = unwrap(onToolStarted(this.#handle, call.id));
              for (const e of started.events) config.onEvent?.(e);

              const handler = config.tools[call.name];
              let result;
              if (handler) {
                result = await handler(call);
              } else {
                result = toolError("unknown_tool", `No handler for ${call.name}`);
              }
              step = unwrap(onToolDone(this.#handle, call.id, result));
              for (const e of step.events) config.onEvent?.(e);
            }
            if ((step.actions ?? []).length === 0) {
              step = unwrap(continueTurn(this.#handle));
              for (const e of step.events) config.onEvent?.(e);
            }
            break;
          }

          case "cancel_tools": {
            for (const id of action.tool_call_ids) {
              step = unwrap(
                onToolCancelled(this.#handle, id, action.reason)
              );
              for (const e of step.events) config.onEvent?.(e);
            }
            break;
          }

          case "finished":
            return action;

          case "wait_for_input":
            return action;

          default:
            return action;
        }
      }
    }
  }

  /** Reset agent state (clear messages, return to idle). */
  reset() {
    unwrap(reset(this.#handle));
  }

  /** Get public agent state. */
  state() {
    return unwrap(state(this.#handle));
  }

  /** Get session state for persistence. */
  getSessionState() {
    return unwrap(getSessionState(this.#handle));
  }

  /** Set session state (e.g. after restoring from storage). */
  setSessionState(sessionState) {
    unwrap(setSessionState(this.#handle, sessionState));
  }

  /** Send a steering message mid-turn. */
  steer(message) {
    const out = unwrap(steer(this.#handle, message));
    return out.events;
  }

  /** Queue a follow-up message. */
  followUp(message) {
    unwrap(followUp(this.#handle, message));
  }

  /** Destroy the underlying WASM handle. */
  destroy() {
    destroyAgent(this.#handle);
  }
}
