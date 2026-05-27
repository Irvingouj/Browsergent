# @pi-oxide/pi-host-web

WASM host for [pi-core](https://github.com/pi-oxide/pi-oxide) — a deterministic agent state machine, compiled to WebAssembly for browser and Node.js.

## What it is

This package exposes the `pi-core` agent loop through typed JavaScript APIs. Every function returns a strongly-typed result envelope — never throws. The TypeScript definitions are generated directly from Rust structs via [tsify](https://github.com/madonoharu/tsify).

## Install

```bash
npm install @pi-oxide/pi-host-web
```

## Usage

### Browser

```typescript
import init, * as wasm from "@pi-oxide/pi-host-web";

// Initialize the WASM module (async, required once)
await init();

// Create an agent
const result = wasm.createAgent({
  system_prompt: "You are a helpful assistant.",
  model: {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet",
    api: "anthropic",
    provider: "anthropic",
    reasoning: false,
    context_window: 200000,
    max_tokens: 4096,
  },
});

const handle = result.data.handle;

// Send a prompt
const step = wasm.prompt(handle, { text: "Hello!" });
console.log(step.data.actions);
```

### Node.js

```typescript
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("@pi-oxide/pi-host-web/package.json"));
const wasmPath = join(pkgDir, "pi_host_web_bg.wasm");
const wasmBytes = readFileSync(wasmPath);

const pkg = await import("@pi-oxide/pi-host-web");
pkg.initSync({ module: wasmBytes });

// Now use pkg.createAgent(), pkg.prompt(), etc.
const result = pkg.createAgent({ ... });
```

## API

### Agent lifecycle

| Function | Input | Returns | Description |
|----------|-------|---------|-------------|
| `createAgent(options)` | `AgentOptions` | `CreateAgentResult` | Creates a new agent instance |
| `destroyAgent(handle)` | `number` | `EmptyResult` | Destroys an agent and frees its slot |
| `reset(handle)` | `number` | `EmptyResult` | Resets agent state (keeps config) |
| `state(handle)` | `number` | `StateResult` | Returns current agent state |

### Turn loop

| Function | Input | Returns | Description |
|----------|-------|---------|-------------|
| `prompt(handle, request)` | `number`, `PromptRequest` | `StepResult` | Starts a new turn |
| `feedLlmChunk(handle, chunk)` | `number`, `LlmChunk` | `EventsResult` | Feeds a streaming LLM chunk |
| `onLlmDone(handle, result)` | `number`, `LlmResult` | `StepResult` | Signals LLM stream completion |
| `onToolDone(handle, id, payload)` | `number`, `string`, `ToolDonePayload` | `StepResult` | Reports tool execution result |
| `onToolStarted(handle, id)` | `number`, `string` | `EventsResult` | Signals tool execution started |
| `onToolUpdate(handle, update)` | `number`, `ToolExecutionUpdate` | `EventsResult` | Streams tool stdout/stderr |
| `onToolCancelled(handle, id, reason)` | `number`, `string`, `CancelReason` | `StepResult` | Cancels a running tool |

### Context projection

| Function | Input | Returns | Description |
|----------|-------|---------|-------------|
| `projectContext(input)` | `ProjectionInput` | `ProjectionResult` | Projects context to fit budget |

### Steering

| Function | Input | Returns | Description |
|----------|-------|---------|-------------|
| `steer(handle, message)` | `number`, `AgentMessage` | `EventsResult` | Injects a steering message |
| `followUp(handle, message)` | `number`, `AgentMessage` | `EmptyResult` | Appends a follow-up message |

### Observability

| Function | Returns | Description |
|----------|---------|-------------|
| `drainTraceLog()` | `string[]` | Drains and clears the Rust trace buffer |

## Result envelopes

Every function returns a typed result with this shape:

```typescript
interface Result<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

Concrete types: `CreateAgentResult`, `StepResult`, `EventsResult`, `StateResult`, `EmptyResult`, `ProjectionResult`.

## Files

- `pi_host_web.js` — Main ESM entry point
- `pi_host_web_bg.wasm` — Compiled WebAssembly binary
- `pi_host_web.d.ts` — TypeScript declarations (generated from Rust)

## License

MIT
