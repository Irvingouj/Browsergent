/**
 * Lua runtime using piccolo WASM.
 *
 * Provides the page.* API to Lua playbooks, executing BrowserCommands
 * through the same content-script path as the agent.
 */

import type { BrowserCommand, BrowserResult } from "../types/browser";
import type { ActionTraceEntry } from "../types/messages";

// --- Types matching piccolo RunResult ---

interface LuaRunResult {
  stdout: string[];
  stderr: string[];
  result: string | null;
  error: { kind: string; message: string; line?: number } | null;
  commands: unknown[];
  fuel_exhausted: boolean;
  execution_count: number;
  status: "done" | "async_pending";
  pending_command: {
    call_id: number;
    action: string;
    params: unknown;
  } | null;
}

interface LuaAsyncResponse {
  ok: boolean;
  value?: unknown;
  error?: { message: string; code: string };
}

export interface LuaCallbacks {
  onOutput: (text: string) => void;
  onTrace: (entry: ActionTraceEntry) => void;
  executeCommand: (command: BrowserCommand) => Promise<BrowserResult>;
}

let luaWasmReady = false;
let WasmSessionCtor: new () => LuaWasmSession;

interface LuaWasmSession {
  run_cell(code: string, stdin: string): string;
  resume_cell(resultJson: string): string;
  reset(): void;
  set_fuel_limit(limit: number): void;
  load_library(source: string): string;
}

async function initLuaWasm(): Promise<void> {
  if (luaWasmReady) return;

  const wasmUrl =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("pkg/piccolo_notebook_wasm.js")
      : "/pkg/piccolo_notebook_wasm.js";
  const mod = (await import(/* @vite-ignore */ wasmUrl)) as {
    default?: (moduleOrPath?: unknown) => Promise<unknown>;
    WasmSession?: new () => LuaWasmSession;
  };
  if (typeof mod.default === "function") {
    await mod.default();
  }
  if (!mod.WasmSession) {
    throw new Error("piccolo WASM module did not export WasmSession");
  }
  WasmSessionCtor = mod.WasmSession;
  luaWasmReady = true;
}

/** Map a Lua page.* action + params to a BrowserCommand. */
function mapLuaToCommand(action: string, params: unknown): BrowserCommand {
  const p = params as Record<string, unknown>;
  switch (action) {
    case "host_browsergent_page_clear":
      return { kind: "page.clear", refId: p.refId as string };
    case "host_browsergent_page_extract":
      return { kind: "page.extract", refId: p.refId as string | undefined };
    case "page_snapshot":
      return { kind: "page.snapshot", options: { onlyVisible: p.onlyVisible as boolean | undefined } };
    case "page_click":
      return { kind: "page.click", refId: p.refId as string };
    case "page_fill":
      return { kind: "page.fill", refId: p.refId as string, text: p.value as string };
    case "page_clear":
      return { kind: "page.clear", refId: p.refId as string };
    case "page_select":
      return { kind: "page.select", refId: p.refId as string, value: p.value as string };
    case "page_press":
      return { kind: "page.press", key: p.key as string };
    case "page_scroll":
      return { kind: "page.scroll", direction: p.direction as "up" | "down", amount: p.amount as number | undefined };
    case "page_extract":
      return { kind: "page.extract", refId: p.refId as string | undefined };
    case "page_goto":
      return { kind: "page.goto", url: p.url as string };
    case "page_back":
      return { kind: "page.back" };
    case "page_forward":
      return { kind: "page.forward" };
    case "page_reload":
      return { kind: "page.reload" };
    default:
      throw new Error(`Unsupported Lua page action: ${action}`);
  }
}

const BROWSERGENT_PAGE_LIBRARY = `
if page.clear == nil then
  function page.clear(ref_id)
    return host.call("browsergent_page_clear", { refId = ref_id })
  end
end

if page.extract == nil then
  function page.extract(ref_id)
    return host.call("browsergent_page_extract", { refId = ref_id })
  end
end
`;

export class LuaRuntime {
  private session: LuaWasmSession | null = null;
  private aborted = false;

  async init(): Promise<void> {
    await initLuaWasm();
    this.session = new WasmSessionCtor();
    this.session.set_fuel_limit(100000);
    this.session.load_library(BROWSERGENT_PAGE_LIBRARY);
  }

  async run(code: string, callbacks: LuaCallbacks): Promise<void> {
    if (!this.session) {
      await this.init();
    }
    this.aborted = false;

    let resultJson = this.session!.run_cell(code, "");
    let result: LuaRunResult = JSON.parse(resultJson);
    let step = 0;

    // Handle async yield/resume loop
    while (result.status === "async_pending" && result.pending_command && !this.aborted) {
      step++;
      const cmd = result.pending_command;
      const command = mapLuaToCommand(cmd.action, cmd.params);

      const traceId = crypto.randomUUID();
      callbacks.onTrace({
        id: traceId,
        step,
        status: "running",
        command,
        timestamp: Date.now(),
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

      // Flush stdout produced before this async boundary.
      for (const line of result.stdout) {
        callbacks.onOutput(line + "\n");
      }

      // Resume with the browser result
      const response: LuaAsyncResponse = browserResult.ok
        ? { ok: true, value: browserResult.value }
        : { ok: false, error: { message: browserResult.error, code: browserResult.code } };

      resultJson = this.session!.resume_cell(JSON.stringify(response));
      result = JSON.parse(resultJson);
    }

    // Output remaining stdout/stderr
    for (const line of result.stdout) {
      callbacks.onOutput(line + "\n");
    }
    for (const line of result.stderr) {
      callbacks.onOutput("STDERR: " + line + "\n");
    }

    if (result.result) {
      callbacks.onOutput("=> " + result.result + "\n");
    }

    if (result.error) {
      callbacks.onOutput("Error: " + result.error.message + "\n");
    }

    if (result.fuel_exhausted) {
      callbacks.onOutput("Error: Fuel exhausted (possible infinite loop)\n");
    }
  }

  stop(): void {
    this.aborted = true;
  }

  reset(): void {
    this.session?.reset();
    this.session?.load_library(BROWSERGENT_PAGE_LIBRARY);
  }
}
