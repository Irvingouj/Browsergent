/**
 * Bridge to pi-host-web WASM.
 *
 * Loads the WASM module and exposes typed wrappers around the JSON-envelope API.
 */

let wasmReady = false;

export interface WasmModule {
  createAgent(optionsJson: string): string;
  prompt(handle: number, promptJson: string): string;
  feedLlmChunk(handle: number, chunkJson: string): string;
  onLlmDone(handle: number, resultJson: string): string;
  onToolDone(handle: number, toolCallId: string, resultJson: string): string;
  onToolStarted(handle: number, toolCallId: string): string;
  state(handle: number): string;
  reset(handle: number): string;
  destroyAgent(handle: number): string;
}

let wasmModule: WasmModule | null = null;

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

function unwrap<T>(json: string): T {
  const env: Envelope<T> = JSON.parse(json);
  if (!env.ok) {
    throw new Error(`WASM error [${env.error?.code}]: ${env.error?.message}`);
  }
  return env.data as T;
}

export async function initWasm(): Promise<void> {
  if (wasmReady) return;
  const wasmUrl =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("pkg/pi_host_web.js")
      : "/pkg/pi_host_web.js";
  const mod = (await import(/* @vite-ignore */ wasmUrl)) as WasmModule & {
    default?: (moduleOrPath?: unknown) => Promise<unknown>;
  };
  if (typeof mod.default === "function") {
    await mod.default();
  }
  wasmModule = mod as unknown as WasmModule;
  wasmReady = true;
}

function getModule(): WasmModule {
  if (!wasmModule) throw new Error("WASM not initialized");
  return wasmModule;
}

export function wasmCreateAgent(options: Record<string, unknown>): number {
  const data = unwrap<{ handle: number }>(getModule().createAgent(JSON.stringify(options)));
  return data.handle;
}

export function wasmPrompt(handle: number, text: string): { events: unknown[]; actions: unknown[] } {
  return unwrap(getModule().prompt(handle, JSON.stringify({ text })));
}

export function wasmFeedLlmChunk(handle: number, chunk: unknown): { events: unknown[] } {
  return unwrap(getModule().feedLlmChunk(handle, JSON.stringify(chunk)));
}

export function wasmOnLlmDone(handle: number, result: unknown): { events: unknown[]; actions: unknown[] } {
  return unwrap(getModule().onLlmDone(handle, JSON.stringify(result)));
}

export function wasmOnToolDone(
  handle: number,
  toolCallId: string,
  result: unknown,
): { events: unknown[]; actions: unknown[] } {
  return unwrap(getModule().onToolDone(handle, toolCallId, JSON.stringify(result)));
}

export function wasmOnToolStarted(handle: number, toolCallId: string): { events: unknown[] } {
  return unwrap(getModule().onToolStarted(handle, toolCallId));
}

export function wasmState(handle: number): unknown {
  return unwrap(getModule().state(handle));
}

export function wasmReset(handle: number): void {
  unwrap(getModule().reset(handle));
}

export function wasmDestroyAgent(handle: number): void {
  unwrap(getModule().destroyAgent(handle));
}
