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
  status: "done" | "async_wait" | "error";
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Load the WASM JS glue code via script tag
  // In a Chrome extension, extension pages can load sibling scripts
  const existingScript = document.querySelector('script[src*="piccolo"]');
  if (!existingScript) {
    const script = document.createElement("script");
    script.src = "./pkg/piccolo_notebook_wasm.js";
    script.type = "module";

    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load piccolo WASM JS"));
      document.head.appendChild(script);
    });
  }

  // The wasm-bindgen --target web exports are on the module scope.
  // Since we loaded via script tag, we need to use dynamic import.
  // Chrome extension pages support import() for URLs within the extension.
  const wasmUrl = chrome.runtime.getURL("pkg/piccolo_notebook_wasm.js");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const mod = await import(/* @vite-ignore */ wasmUrl);
  if (typeof mod.default === "function") {
    await mod.default();
  }
  WasmSessionCtor = mod.WasmSession;
  luaWasmReady = true;
}

/** Map a Lua page.* action + params to a BrowserCommand. */
function mapLuaToCommand(action: string, params: unknown): BrowserCommand {
  const p = params as Record<string, unknown>;
  switch (action) {
    case "page.snapshot":
      return { kind: "page.snapshot", options: { onlyVisible: p.only_visible as boolean | undefined } };
    case "page.click":
      return { kind: "page.click", refId: p.ref_id as string };
    case "page.fill":
      return { kind: "page.fill", refId: p.ref_id as string, text: p.text as string };
    case "page.clear":
      return { kind: "page.clear", refId: p.ref_id as string };
    case "page.select":
      return { kind: "page.select", refId: p.ref_id as string, value: p.value as string };
    case "page.press":
      return { kind: "page.press", key: p.key as string };
    case "page.scroll":
      return { kind: "page.scroll", direction: p.direction as "up" | "down", amount: p.amount as number | undefined };
    case "page.extract":
      return { kind: "page.extract", refId: p.ref_id as string | undefined };
    case "page.goto":
      return { kind: "page.goto", url: p.url as string };
    case "page.back":
      return { kind: "page.back" };
    case "page.forward":
      return { kind: "page.forward" };
    case "page.reload":
      return { kind: "page.reload" };
    default:
      return { kind: "page.snapshot" };
  }
}

/** The page.* library source injected into the Lua VM. */
const PAGE_LIBRARY = `
local page = {}

function page.snapshot(options)
  options = options or {}
  coroutine.yield({
    action = "page.snapshot",
    params = { only_visible = options.only_visible }
  })
end

function page.click(ref_id)
  coroutine.yield({
    action = "page.click",
    params = { ref_id = ref_id }
  })
end

function page.fill(ref_id, text)
  coroutine.yield({
    action = "page.fill",
    params = { ref_id = ref_id, text = text }
  })
end

function page.clear(ref_id)
  coroutine.yield({
    action = "page.clear",
    params = { ref_id = ref_id }
  })
end

function page.select(ref_id, value)
  coroutine.yield({
    action = "page.select",
    params = { ref_id = ref_id, value = value }
  })
end

function page.press(key)
  coroutine.yield({
    action = "page.press",
    params = { key = key }
  })
end

function page.scroll(direction, amount)
  coroutine.yield({
    action = "page.scroll",
    params = { direction = direction, amount = amount }
  })
end

function page.extract(ref_id)
  coroutine.yield({
    action = "page.extract",
    params = { ref_id = ref_id }
  })
end

function page.goto(url)
  coroutine.yield({
    action = "page.goto",
    params = { url = url }
  })
end

function page.back()
  coroutine.yield({
    action = "page.back",
    params = {}
  })
end

function page.forward()
  coroutine.yield({
    action = "page.forward",
    params = {}
  })
end

function page.reload()
  coroutine.yield({
    action = "page.reload",
    params = {}
  })
end
`;

export class LuaRuntime {
  private session: LuaWasmSession | null = null;
  private aborted = false;

  async init(): Promise<void> {
    await initLuaWasm();
    this.session = new WasmSessionCtor();
    this.session.set_fuel_limit(100000);
    // Load the page.* library
    this.session.load_library(PAGE_LIBRARY);
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
    while (result.status === "async_wait" && result.pending_command && !this.aborted) {
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

      // Output any stdout
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
    this.session?.load_library(PAGE_LIBRARY);
  }
}
