# Refactoring Plan: Move Agent + Lua into the Web Worker

## Problem

Both `AgentLoop` and `LuaRuntime` currently run directly in the Preact UI thread (`app.tsx`). This blocks rendering during WASM execution, LLM API calls, and browser command waits. The Worker (`worker/index.ts`) already has complete handler code for both, but the UI ignores it.

## How web-lua does it

The pattern from `web-lua`:

```
UI thread (useKernel.ts)
  └─ creates Worker via `new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' })`
  └─ sends: { type: 'runCell', id, code, stdin }
  └─ receives: { type: 'result', id, data }
  └─ receives: { type: 'asyncRelay', id, command } ← Worker needs main thread help
  └─ sends back: { type: 'asyncRelayResult', id, result } ← result from main thread

Worker (worker.ts)
  └─ loads WASM on init
  └─ runs code, handles yield/resume loop
  └─ for commands that need main thread (DOM, chrome.*, page.*):
       posts { type: 'asyncRelay' } to main thread
       waits for { type: 'asyncRelayResult' } back
```

Key insight: In web-lua, the Worker does NOT have access to chrome.* APIs or DOM. So page.* actions go through an **async relay** — Worker posts to main thread, main thread executes, posts result back.

## Key difference for Browsergent

Browsergent runs in a Chrome extension. The side panel page **does** have `chrome.runtime.sendMessage`. But the Web Worker spawned from the side panel also has access to `chrome.runtime` in MV3.

So Browsergent's relay chain is simpler:

```
Worker
  ├─ pi-core WASM (agent brain)
  ├─ piccolo WASM (Lua runtime)
  └─ chrome.runtime.sendMessage → Background → Content Script
```

No main-thread relay needed. The Worker can call `chrome.runtime.sendMessage` directly. This is already implemented in `worker/index.ts` lines 25-42.

## What needs to change

### Step 1: Worker as a standalone entry point

The Worker currently imports from `worker/index.ts`. Vite bundles it as a chunk instead of a standalone file.

**Change**: Add worker as a separate rollup input entry in `vite.config.ts`. The worker must be its own file because Web Workers can't be loaded as chunks.

```
vite.config.ts rollupOptions.input:
  + worker: src/worker/index.ts    ← must be standalone
  sidepanel: src/sidepanel.html
  background: src/background/index.ts
  content-script: src/content/index.ts
```

**Verify**: `dist/worker.js` exists and is self-contained.

### Step 2: Wire app.tsx to create Worker and send messages

Replace the direct `AgentLoop` and `LuaRuntime` instantiation with Worker `postMessage`.

**app.tsx changes**:
- Create `new Worker(chrome.runtime.getURL("worker.js"), { type: "module" })` on mount
- `handleRun()` → posts `{ type: "agentStart", task, maxSteps: 20 }` to worker
- `handleStop()` → posts `{ type: "agentStop" }` to worker
- `handleLuaRun()` → posts `{ type: "luaRun", id, code }` to worker
- Worker `onmessage` dispatches to state setters (same as current, just data from worker)

**Remove from app.tsx**:
- `import { AgentLoop }` 
- `import { LuaRuntime }`
- `agentLoopRef` / `luaRuntimeRef`
- `executeBrowserCommand()` helper (it's in the worker now)

### Step 3: Clean up worker/index.ts

The worker already has the right handlers. Changes needed:

1. **WASM loading**: Use `chrome.runtime.getURL()` instead of bare `/pkg/` paths
2. **Agent loop**: `handleAgentStart` already creates `AgentLoop` and wires callbacks → `post()`. This is correct.
3. **Lua**: `handleLuaRun` already creates `LuaRuntime` and wires callbacks → `post()`. This is correct.
4. **Worker ready**: Posts `{ type: "workerReady" }` on load. UI waits for this.

### Step 4: Fix WASM loading in Worker context

Both `wasm-bridge.ts` and `lua-runtime.ts` use `chrome.runtime.getURL()` to load WASM. In a Worker, `chrome.runtime` is available in MV3 extension Workers.

**wasm-bridge.ts**: Already uses `chrome.runtime.getURL("pkg/pi_host_web.js")`. Should work in Worker.

**lua-runtime.ts**: Already uses `chrome.runtime.getURL("pkg/piccolo_notebook_wasm.js")`. Should work in Worker.

**Verify**: No `document.createElement("script")` calls remain (those don't work in Workers).

### Step 5: Build adjustments

**vite.config.ts**:
- Worker must be in `rollupOptions.input` as a separate entry
- Worker output must NOT reference chunks — it needs to be self-contained
- Mark `pi_host_web.js` and `piccolo_notebook_wasm.js` as external (loaded at runtime via `chrome.runtime.getURL`)

**Alternative**: Since the WASM is loaded dynamically at runtime via `chrome.runtime.getURL`, and the imports use `/* @vite-ignore */`, Vite should already leave them as dynamic imports. The worker just needs to be a standalone entry.

### Step 6: Update tests

Tests that create `AgentLoop` or `LuaRuntime` directly still work for unit testing. E2E tests test through the extension. No changes needed for passing tests.

### Step 7: Remove dead code

After the refactor:
- `app.tsx` no longer imports `AgentLoop` or `LuaRuntime`
- `executeBrowserCommand` helper moves to worker only
- The duplicate handler code is eliminated

## File changes summary

| File | Action |
|------|--------|
| `vite.config.ts` | Add `worker` as separate rollup input |
| `src/sidepanel/app.tsx` | Replace direct runtime calls with Worker postMessage |
| `src/worker/index.ts` | Verify WASM paths work in Worker context |
| `src/worker/wasm-bridge.ts` | Verify (already uses chrome.runtime.getURL) |
| `src/worker/lua-runtime.ts` | Verify (already uses chrome.runtime.getURL) |
| `src/worker/agent-loop.ts` | No changes (already worker-safe) |
| `scripts/build.sh` | Handle worker.js output |

## Verification

After each step:

1. `npx tsc --noEmit` — type check passes
2. `bash scripts/build.sh` — build succeeds, `dist/worker.js` exists
3. `npx playwright test` — all 14 tests still pass
4. Manual: load extension, side panel opens, chat and Lua tabs work

## Risk areas

- **Vite Worker bundling**: Getting a standalone worker.js out of Vite can be tricky. If rollup tries to chunk it, we may need a custom Vite plugin or a separate esbuild step for the worker.
- **`chrome.runtime` in Worker**: MV3 extension Workers (service workers) have chrome.runtime, but Web Workers spawned from extension pages might not in all Chrome versions. Need to verify.
- **Dynamic WASM import in Worker**: `import(chrome.runtime.getURL(...))` in a Worker may behave differently than in an extension page. May need `fetch` + `WebAssembly.instantiateStreaming` instead.

## Order of operations

```
1. Make worker a standalone build entry    → verify build
2. Wire app.tsx to Worker postMessage      → verify build + types
3. Run all tests                           → verify nothing breaks
4. Manual test: load extension, try chat   → verify end to end
5. Clean up dead code
```
