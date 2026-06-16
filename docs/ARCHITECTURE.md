# Browsergent — Architecture

A maintainer's reference for the **Browsergent** product and the two libraries it is built
from: **pi-oxide** (the Rust "brain") and **web-js** (the sandboxed JS "hands").

> One-line summary: an AI agent that lives in a Chrome side panel. The LLM **reasons and
> writes JavaScript**; that JS runs in a sandboxed QuickJS runtime that **yields typed
> browser commands** to a content script. The agent's *only* tool is `run_js`.

---

## 1. The three repositories

| Repo | Path | Role | Lang / build |
|------|------|------|--------------|
| **Browsergent** | `~/code/Browsergent` | The product: Chrome MV3 extension (UI, worker, wiring) | TypeScript (Preact + Vite + Zustand) |
| **pi-oxide** | `~/code/pi-oxide` | The brain: sans-IO Rust agent state machine + WASM bindings + a TS SDK on top | Rust → WASM; TS SDK |
| **web-js** | `~/code/web-js` | The hands: sandboxed QuickJS runtime that executes `run_js` and dispatches `page.*` | Rust → WASM (rquickjs); TS runner |

Browsergent depends on two published npm packages produced by the other repos:

```
"@pi-oxide/extension-js": "^0.9.1"   // from web-js  (the JS sandbox + browser command dispatch)
"@pi-oxide/pi-host-web":  "^0.9.1"   // from pi-oxide (Rust core → WASM + TS SDK)
```

### Layering (top → bottom)

```
Browsergent (extension)
 ├─ Side Panel UI ............. Preact + Zustand (main thread)
 ├─ Web Worker ................ drives the Agent SDK; owns the Anthropic HTTP call
 │     └─ @pi-oxide/pi-host-web  (TS SDK: Agent / defineModel / AgentEngine)
 │           └─ raw WASM bindings (createHostAgent, startTurn, hostFeedLlmChunk, …)
 │                 └─ pi-core (Rust: synchronous state machine, context projection)
 └─ @pi-oxide/extension-js .... sandboxed QuickJS; runs run_js; dispatches page.*
       └─ content script ........ DOM snapshot engine + click/fill/scroll executor
```

**The cardinal rule:** the LLM never touches the DOM, Chrome APIs, `fetch`, or the
network directly. It only emits JavaScript, which executes inside the QuickJS sandbox.
Every side effect is a typed command that crosses a typed boundary.

---

## 2. End-to-end control flow — one agent turn

This is the single most important thing to understand. "The host is the cup, the core is
the bartender" (pi-oxide/design.md): **all side effects live in TypeScript; the Rust core
is pure computation that emits typed directives.**

```
 USER types a task in the side panel
   │
   ▼  postMessage(agentStart {task, resolvedTask, settings, tools})
 WEB WORKER (src/worker/agent-loop.ts)
   │  AgentLoop.run() builds `new Agent({ model, tools, instructions, store })`
   │  from @pi-oxide/pi-host-web and subscribes to agent.on('text'|'status'|'toolStart'…)
   ▼
 AGENT ENGINE (pi-host-web SDK)  ── calls ──►  WASM core (pi-core)
   │                                            │  startTurn → directive: StreamLlm { context }
   │  ◄─────────────────────────────────────────┘
   │  Engine sees StreamLlm → invokes the AgentModel.generateStream()
   ▼
 ANTHROPIC PROVIDER (src/worker/anthropic.ts)
   │  raw fetch POST ${baseUrl}/v1/messages  (SSE; x-api-key + anthropic-version)
   │  retries 429/5xx/network ≤ 3×
   ▼  SSE chunks (anthropic-sse.ts) → LlmChunk { start | text_delta | tool_call_delta | done }
 WEB WORKER feeds each chunk back into the core via hostFeedLlmChunk(handle, chunk)
   │  core accumulates the streaming assistant message, emits MessageUpdate events
   ▼  on stream end: hostLlmDone(handle, LlmResult::Ok(assistantMessage))
 WASM CORE
   │  if NO tool calls  → Finished  ──►  turn done (after projection_scan + Persist)
   │  if tool calls     → PrepareToolCalls directive  (phase = PreToolCall)
   ▼
 WEB WORKER resolves each ToolCall → ToolCallPreparation[] (transform / permission)
   │  hostPrepareToolCalls(handle, preparationsJson)  → directive: ExecuteTools { calls }
   ▼
 FOR EACH tool call (the only one that matters here is `run_js`):
   │  AgentToolDefinition.run (src/worker/agent-tools.ts) invokes the injected runJs(code)
   │  worker.relayExtjsExecution(code) → postMessage(extjsRunRequest {id, code})
   │  (Promise parked in pendingExtjsRelays, 30s timeout)
   ▼
 SIDE PANEL MAIN THREAD
   │  WorkerBridge → ExtjsController → ExtensionJsClient.runJs(code)
   │     → session.runCellAsync(code)   (@pi-oxide/extension-js)
   ▼
 QUICKJS SANDBOX (web-js) executes the LLM's JS
   │  `await page.click("e3")` → makeAsync('page_click') → __webJsTriggerAsync
   │  → yields AsyncCommand { action:'page_click', params:{refId:'e3'} }
   ▼
 EXTENSION-JS RUNNER routes by owner (shared/registry/routes.ts)
   │  page_click is a content-script tool → relay via port message to active tab
   ▼
 CONTENT SCRIPT (vendored from extension-js)
   │  handlers.click → getElementByRefId('e3') [reads data-ref-id] → el.click()
   │  → makeActionResult
   ▼  result relays back: runner → resume_cell → QuickJS promise resolves
 CELL RESULT (CellResult) flows back:
   │  ExtensionJsClient → extjsRunResult → worker resolves parked Promise
   ▼  hostToolDone(handle, id, ToolResult)
 WASM CORE wraps result as OriginalToolResult into the transcript (T)
   │  when ALL pending tools done → finalize_tool_batch → WaitForInput (phase = ReadyToContinue)
   ▼  hostContinueTurn(handle) → drains steering/follow-up → rebuilds context → StreamLlm  (loop)
 … repeats until the assistant stops with no tool calls → Finished.
```

Three things to internalize:

1. **The Anthropic HTTP call is in TypeScript** (the Web Worker), never in Rust. The core
   only *asks* for a model stream (`StreamLlm` directive) and *ingests* the chunks the
   worker feeds it (`hostFeedLlmChunk` / `hostLlmDone`).
2. **`run_js` is defined nowhere in pi-oxide.** The core is fully tool-agnostic: a tool is
   just a `{ name, description, parameters: JSONSchema }` supplied at `startTurn`. The
   Browsergent worker registers `run_js` (and file/skill helpers) as tool definitions.
3. **The worker ↔ sandbox handoff is a parked Promise.** While `run_js` runs, the worker
   is suspended on a Promise in `pendingExtjsRelays`; the main thread does the real work
   and posts `extjsRunResult` back.

---

## 3. The `run_js` → `page.*` execution path (web-js internals)

The sandbox is the heart of "the LLM acts on the page". It is a **cooperative
yield/resume** machine, not a callback bridge across the WASM boundary.

```
 LLM emits:  run_js({ code: "await page.click('e3'); await page.fill('e7','hi');" })
   │
   ▼  ExtensionJsClient.runJs → ExtensionSession.runCellAsync(code)   (in a Web Worker)
 web-js-core: JsSession.run_cell(code)
   │  wraps code in  (async function __webJsCell(){ …code… })()
   │  evals with promise:false  (TLA eval recursively drives async resume → wasm stack overflow;
   │                              the host drives resume explicitly instead)
   ▼  code hits:  await page.click('e3')
 prelude.js: makeAsync('page_click', ['refId'])
   │  returns new Promise((resolve,reject) => __webJsTriggerAsync('page_click', {refId:'e3'}, resolve, reject))
 globals.rs: __webJsTriggerAsync
   │  stores {resolve,reject} in global __webJsPending[call_id]
   │  pushes AsyncCommand{call_id, action:'page_click', params:{refId:'e3'}} to pending_async_commands
   ▼  top-level promise pending → RunResult { status: AsyncPending, pending_commands }
 web-js-base: run_cell_async_loop  (the async driver, rides wasm-bindgen-futures executor)
   │  batches ALL pending commands → join_all(handle_command) concurrently
   │  then resume_cell(call_id, response) serially per call_id → loop until Done/Err
   ▼  handle_command dispatches via web_js_core::api_docs::dispatch_handler
 EXTENSION-JS TS RUNNER routes page_click (content-script owner):
   │  registryCall → port message → active tab content script
   ▼
 CONTENT SCRIPT: handlers.click
   │  getElementByRefId('e3') → assertInteractable → el.click() → makeActionResult
   ▼  result → runner → resume_cell(call_id, responseJson)
 async_resume.rs: resume_async_pending
   │  looks up __webJsPending[call_id] → resolve(value) or reject(Error{code,hint,recovery,…})
   │  promise settles → QuickJS continues synchronously to the next line of LLM code
```

Key properties:

- **Fuel limit** = an interrupt-handler *instruction counter* (extension default
  **10,000,000**; playground 50,000). Not wall-clock. Exhausting it → `CellError::FuelExhausted`.
- **`fs.*`, `crypto.*`, `web.*`, `console.*`** are registered as Rust handlers and run
  inside WASM. **`page.*`, `chrome.*`, `sidepanel.*`, `dom.*`, `host.*`** are registered
  from TypeScript (they need chrome APIs / the content script) and pushed into the WASM
  manifest via `registerJsCallBatch` / `importManifestEntries`.
- **refIds** (`e1`..`eN`) are produced by `dom-semantic-tree` (`RefAllocator`) and written
  to the DOM as `data-ref-id` attributes by the content script, so `page.click('e3')`
  resolves to the same element the snapshot labeled `e3`.

---

## 4. Repository: Browsergent (`~/code/Browsergent`)

Chrome MV3 extension. Four runtime threads:

| Thread | Entrypoint | Built as | Responsibility |
|--------|-----------|----------|----------------|
| Side panel (main) | `src/sidepanel/index.tsx` → `sidepanel.html` | Preact UI | Chat UI, `ExtensionJsClient` singleton, controllers |
| Web Worker | `src/worker/index.ts` → `agent-worker.js` | ES module | Hosts the Agent SDK; owns Anthropic call; relays `run_js` |
| Background SW | `src/background/index.ts` → `background.js` | minimal | Only opens the side panel on action click + tab tracking. **Does not route browser commands.** |
| Content script | vendored `dist/content-script.js` (from `@pi-oxide/extension-js`) | — | Snapshot + DOM actions in the active tab |

> The content script is **not** in Browsergent's `src/`. The Vite build plugin
> (`vite.config.ts`) copies it from `@pi-oxide/extension-js` into `dist/`. All command
> execution lives in that vendored script; Browsergent's `src/types/browser.ts` holds the
> canonical `BrowserCommand`/`BrowserResult`/`PageSnapshot` types **as reference only**.

### 4.1 Worker — the "cup"

- **`src/worker/agent-loop.ts`** — `AgentLoop.run()` builds `new Agent({...})` from
  `@pi-oxide/pi-host-web`, subscribes to `agent.on('text'|'status'|'toolStart'|'toolEnd'|'messageEnd'|'error')`,
  and forwards everything to the panel via `postMessage`. `STATUS_MAP` translates SDK
  states to `AgentStatus` (`calling_model`→`waiting_for_model`, `running_tool`→`executing_tool`,
  `completed`→`done`, …). A turn that ends `completed` with zero output is reclassified as
  an error (silent-stream-failure guard).
- **`src/worker/anthropic*.ts`** — no Anthropic SDK; pure `fetch` + SSE.
  - `anthropic.ts` `AnthropicProvider.call()` → `POST ${baseUrl}/v1/messages`
    (x-api-key + anthropic-version; Bearer for fireworks.ai), retries 429/5xx ≤ 3×.
  - `anthropic-sse.ts` parses SSE → `LlmChunk` stream + `LlmResult`.
  - `anthropic-model.ts` `createAnthropicModel()` wraps the provider in an `AgentModel`
    via `defineModel()`; converts SDK ↔ WASM message shapes.
  - `sdk-message-conversion.ts` / `anthropic-wire.ts` — the translation layers.
- **`src/worker/agent-tools.ts`** — `createAgentTools(runJs, getDocs, loadSkill, fileOp)`
  returns 8 `AgentToolDefinition`s: `run_js`, `get_doc`, `load_skill`, and
  `file_list/read/edit/delete/write`. **`run_js` accepts inline `code` OR `{file:{name}}`
  (mutually exclusive).** Results truncated to 50k chars. `classifyError()` maps sandbox
  error codes to agent-facing hints. `js-tool-prompt.ts` is the single source of truth for
  the `run_js` tool description.

### 4.2 The four relay classes (worker ↔ main thread)

All cross-thread requests follow the identical "post + park a Promise + 30s timeout" pattern:

| Relay | Request msg | Purpose |
|-------|-------------|---------|
| extjsRelay | `extjsRunRequest` | execute `run_js` code |
| extjsDocsRelay | `extjsDocsRequest` | fetch API docs from the sandbox |
| `LoadSkillRelay` | `loadSkillRequest` | read a skill body from OPFS |
| `FileOpRelay` | `fileOpRequest` | list/read/write/edit/delete session files |

### 4.3 Side panel main thread

- **`ExtensionJsClient`** (`src/sidepanel/extension-js-client.ts`) — **singleton** (mandatory:
  extension-js uses a module-level `AbortController`; multiple sessions would race).
  Serializes all access through a promise-chain queue. On non-timeout error it calls
  `rebuildSession()` (stop → re-init → health-check `runCellAsync('1+1')`). Also implements
  `SkillFsClient`, so **skills and files share one OPFS root**.
- **Controllers** (`src/controllers/`) — `WorkerBridge` (sole worker→store bridge,
  validates every message via `worker-guards.ts`, drops stale `runId`s), `ExtjsController`,
  `SessionController` (≤50 sessions, 500ms debounced save), `FilesController`, `SettingsController`.
- **UI/state** — Preact `App` over a 10-slice Zustand vanilla store
  (`src/state/store.ts`: settings, chat, agent, trace, diagnostics, extjs, ui, session,
  skills, files). Streaming text uses `@preact/signals` (`streaming-signals.ts`).

### 4.4 Skills & files

- **Skills** ship bundled in `public/skills/bundled/` (create-skill, fill-and-submit,
  capability-check), sha256-verified via `seed-manifest.json`, seeded into OPFS on first
  run. User skills live in `/skills/user`. `/skill:name [args]` activation is resolved at
  run time into an XML `<skill>` block injected into `resolvedTask`.
- **Files** (`@[file:path:name]` mentions) resolve file contents into `<attachment>` XML
  blocks. Both file tools and the Files tab operate on the same OPFS root.

### 4.5 Build & test

```bash
npm install
npm run dev          # Vite dev
npm run build        # 3 rollup inputs + vendored extension-js assets + bundled skills
npm run typecheck    # tsc --noEmit
npm run test:unit    # ~67 vitest specs
npm run test         # ~27 Playwright e2e (mock SSE Anthropic server in tests/helpers.ts)
```

CSP allows `wasm-unsafe-eval`; target chrome120; minify off.

---

## 5. Repository: pi-oxide (`~/code/pi-oxide`)

The "brain". Workspace crates: **`pi-core`** (pure state machine), **`pi-llm`** (provider
protocol types, no network), **`pi-host-web`** (WASM host + TS SDK), **`pi-host-tui`**
(native terminal client). The Rust workspace is `0.4.0`; the `pi-host-web` npm package is
`0.9.1` — two independent version tracks.

### 5.1 pi-core — the state machine (`pi-core/src/`)

Pure, synchronous, runtime-free. Deps: only serde / serde_json / thiserror / tracing.
**No Tokio, no HTTP, no I/O, no async.**

- **The host boundary is NOT a Rust trait** — it is a *data protocol*:
  - the **typestate `AgentRuntime`** API (`agent_runtime.rs`, ~1160 lines). Each phase
    (`Idle`/`Streaming`/`Compacting`/`PreToolCall`/`ExecutingTools`/`ReadyToContinue`/
    `Finished`/`Aborted`) exposes only valid transitions. Illegal transitions are compile
    errors. Every method takes and returns the host-owned **transcript (T)** and
    **artifacts (A)** plus a `Transition{events, actions, state, transcript, artifacts,
    turn_number, markers}`. **Core holds no cross-turn state.**
  - **`AgentAction`** (core → host, "do this"): `StreamLlm{context}`, `Summarize{context}`,
    `PrepareToolCalls{calls}`, `ExecuteTools{calls}`, `CancelTools`, `WaitForInput{mode}`,
    `Finished`.
  - **`AgentEvent`** (core → host, notifications): `MessageStart/Update/End`,
    `ToolExecutionStart/Update/End/Cancelled`, `QueueUpdate`, `SavePoint`, `Settled`, …

- **Context projection — the T/A model** (`context_projection.rs`):
  - **T** = already-projected message list, sent verbatim to the model.
  - **A** = `BTreeMap<entry_id, OriginalToolResult>` — full text of tool results that were
    projected away. **T ∪ A = the complete conversation.**
  - At turn end, `projection_scan` ages oversized tool results into `ProjectedTool`
    (preview + `artifact_id`), archiving the original to A. **One-way.** Projection
    strategy is currently **hardcoded by tool name** (`read`/`grep`/`bash`→Head by
    age+chars, `edit`/`write`→KeepFull). Token estimate = chars/4.
  - `build_llm_context` is a "brain-dead" T→wire conversion (`ProjectedTool` renders as
    `<context-artifact id='…'>preview</context-artifact>`).

- **Tools are opaque**: `ToolDefinition{name,label,description,parameters:JsonSchema,
  execution_mode, tool_run_mode}` — **no handler in core**. `run_js` is unknown here.

### 5.2 pi-host-web — WASM host + TS SDK (`pi-host-web/`)

Two sub-layers:

**(a) Raw WASM bindings** (`src/*.rs` → `pi_host_web.{js,d.ts,wasm}`):
- Every export is a **synchronous `pub fn`** returning a never-throwing
  `ResultEnvelope{ok, data?, error?}` (built via serde_json roundtrip). Exceptions:
  `hostReadArtifact` / `hostSearchArtifacts` return `Result<_, JsValue>` (can throw).
- Handle model: `createHostAgent(options, budget)` → numeric handle (index into a
  `thread_local` slot table holding `HostAgent{runtime, host_state, transcript, artifacts,
  turn_number, budget}`). The T/A state lives here between calls.
- Crossing: typed DTOs via `tsify` (`#[tsify(into_wasm_abi, from_wasm_abi)]` backed by
  serde-wasm-bindgen). `hostPrepareToolCalls` takes a raw JSON string.
- The turn API (`host_agent_api.rs`): `startTurn`, `hostFeedLlmChunk`, `hostLlmDone`,
  `hostPrepareToolCalls`, `hostToolDone` / `hostToolFailed`, `hostContinueTurn`,
  `hostAcceptCompaction`, `hostSteer`, `hostAbort`, `hostReset`, `getHostAgentPersistData`,
  `restoreHostAgent`, …
- **No `wasm-bindgen-futures`, no stored JS closures, no `js_sys::Function`** — the module
  is purely reactive. (`wasm-bindgen-futures` is a vestigial dep.)

**(b) TypeScript SDK** (`sdk/*.ts` → `dist/sdk/`): the high-level, event-driven surface
Browsergent actually consumes:
- `Agent` class (`sdk/agent.ts`) — `agent.on('text'|'status'|'toolStart'|'toolEnd'|'messageEnd'|'error')`,
  `run()`, `stop()`, `reset()`, `getStatus()`.
- `AgentEngine` (`sdk/orchestration/agent-engine.ts`) — drives the raw turn fns
  (`sdk/bindings/turn-loop.ts`), translating directives ↔ model/tool execution.
- `defineModel()` (`sdk/model.ts`) → `AgentModel{generateStream, summarize}`.
- Built-in providers (`sdk/internal/providers/{anthropic,openai}.ts`), tool registry
  (`sdk/internal/tools/`), IndexedDB store (`sdk/internal/stores/indexedDb.ts`).

> Browsergent does **not** call `hostFeedLlmChunk` itself — it uses the `Agent` SDK, which
> internally drives the raw bindings. Browsergent supplies its own `AgentModel`
> (`createAnthropicModel`) and its own tool definitions (`createAgentTools`).

### 5.3 pi-llm, pi-host-tui

- **`pi-llm`** — pure protocol types (`StreamOptions`, `LlmEvent`, `LlmStream`,
  `StreamError`). No network. Not used by pi-host-web (which uses pi-core's `LlmChunk`);
  conceptually the pattern for the native host.
- **`pi-host-tui`** — the reference native host: `reqwest` (blocking) + `ratatui` +
  `tokio`. Its `trait LlmProvider` and `trait Extension` (tool exec) prove the intended
  pattern: the *web* host inverts it — the TS worker owns the equivalent streaming/tool
  execution instead of Rust trait impls.

### 5.4 Roadmap status (grounded)

| Item | Status |
|------|--------|
| `PrepareToolCalls` / before-tool seam (`ToolCallPreparation`, transform+permission) | ✅ implemented |
| Deferred projection by tool age | ✅ implemented |
| `ToolResult.terminate` / `.details` | 🟡 partial |
| Configurable `ContextProjectionPolicy` (P1) | ❌ still hardcoded by tool name |
| Per-turn system prompt (`StartTurnInput.instructions`) | ❌ not implemented |
| `PrepareNextTurn`, continuation policy, provider/tool-pack registries | ❌ not done |

---

## 6. Repository: web-js (`~/code/web-js`)

The "hands". Workspace (v0.3.0): **`web-js-core`**, **`web-js-base`**, **`web-js`**,
**`extension-js`** (the product), **`dom-semantic-tree`**, **`web-fs`**. Built with
`rquickjs` (QuickJS) compiled to WASM.

### 6.1 Crates

| Crate | Role |
|-------|------|
| `dom-semantic-tree` | Pure DOM → semantic snapshot (refIds, ARIA-like roles, visibility, states) |
| `web-fs` | Real persistent filesystem over **OPFS** (File System Access API), not chrome.storage |
| `web-js-core` | The sandbox: QuickJS `JsSession`, cooperative yield/resume, prelude, manifest + handler registries |
| `web-js-base` | `BaseSession` + `run_cell_async_loop` (the async driver) |
| `web-js` | Playground: `page.*` via `web_sys` on the **main thread**. Not the product. |
| `extension-js` | **Product**: `ExtensionSession` in a Web Worker; `page.*`/`chrome.*`/`sidepanel.*`/`dom.*`/`host.*` registered from TS |

### 6.2 The sandbox contract

- **Entry**: `run_cell(code)` wraps in `(async function __webJsCell(){ … })()`, evals with
  `promise:false` (TLA eval recursively drives async resume on wasm32 → host stack
  overflow; the host drives resume explicitly).
- **Yield**: `await page.click(refId)` → `prelude.js::makeAsync` → a `Promise` that calls
  `__webJsTriggerAsync(action, params, resolve, reject)` (a Rust closure in `globals.rs`).
  It stores `{resolve,reject}` in the global `__webJsPending[call_id]` table and pushes an
  `AsyncCommand` to `pending_async_commands`. A pending top-level promise yields
  `RunResult{status:AsyncPending, pending_commands}`.
- **Resume**: the TS driver does real work (chrome APIs / content-script messaging /
  fetch), then calls `resume_cell(call_id, response_json)` → `async_resume.rs` resolves or
  rejects the stored closure → the promise settles → QuickJS continues synchronously.
- **Fuel**: interrupt-handler instruction counter (extension 10M). `rt.set_max_stack_size(0)`
  (WASM manages the stack).

### 6.3 API namespaces and ownership

Registered in a manifest (`api_docs.rs`) and dispatched by owner (`shared/registry/routes.ts`,
`tool-registry.ts::inferOwner`):

| Namespace | Owner | Notes |
|-----------|-------|-------|
| `fs.*`, `crypto.*`, `web.*`, `console.*` | Rust (in-WASM) | work everywhere |
| `page.*`, `web.tab.*` (DOM) | content script | via `registryCall` port message; **must not** use `chrome.scripting.executeScript` |
| `page.url/title/goto/reload/wait`, `chrome.*`, `sidepanel.*`, `dom.*`, `host.*` | main-thread (worker) | via `chrome.tabs.*` / native dispatch |

`host_*` actions are rewritten to a single `host_call` handler (`handler_registry.rs`) —
the escape hatch that lets sidepanel routing flow through one native handler.

### 6.4 extension-js vs web-js (API gating)

Structural, not a runtime `chrome.runtime.id` check in Rust:
- `extension-js` registers `page.*`/`chrome.*`/etc. **only from the TS runner** (they need
  chrome + the content script), so they exist solely in the extension bundle.
- `web-js` registers `page.*` as **Rust handlers** using `web_sys` directly (main thread).
- `AGENTS.md` declares extension-js the only product; web-js is the playground.

### 6.5 Tests & fixtures

- `web-js-core/src/test_run_cell.rs` (62KB) — cell execution, async yield/resume, fuel errors.
- `extension-js/js/test/*.test.ts` — runner, snapshot dispatch, schemas, cold-tab, worker.
- `testcases/` — static HTML served by `scripts/serve-testcases.mjs`:
  `simple-form-1`, `stale-ref` (rerender → `E_STALE`), `large-dom`, `dynamic-feed`,
  `slow-network`, `media-download`, `file-upload-form`, `snapshot-query`.

---

## 7. The typed boundaries (what holds the stack together)

These are the seams where bugs hide. Each is a discriminated union; none is `any`.

1. **Core ↔ host** (pi-oxide): `AgentAction` / `AgentEvent` — the directive protocol.
   Pure data; synchronous; no closures cross the WASM boundary.
2. **Worker ↔ side panel** (Browsergent): `PanelToWorker` / `WorkerToPanel`
   (`src/types/messages.ts`), validated at the boundary by `src/protocol/worker-guards.ts`.
3. **run_js tool I/O**: `run_js({code} | {file})` → `CellResult{ok,value} | {err,error:WasmCellError}`.
   `classifyError()` maps sandbox codes to `ErrorCode`-ish hints.
4. **JS ↔ browser**: `BrowserCommand` (`page.snapshot|click|fill|…`) → `BrowserResult
   {ok,value} | {ok:false,error,code:ErrorCode}`. Canonical types in
   `Browsergent/src/types/browser.ts`; execution in the vendored extension-js content script.
5. **WASM ↔ TS (web-js)**: `AsyncCommand{call_id,action,params}` ↔ `AsyncResponse{ok,value,error}`,
   `RunResult{status:Done|AsyncPending, pending_commands}`, `CellError`.

---

## 8. Design principles (enforced across all three repos)

From each repo's `AGENTS.md` / `CLAUDE.md`:

- **Type safety protects every boundary.** No `any`, no `Object` (use
  `Record<string,unknown>`); `unknown` is permitted. Discriminated unions with `kind`/`type`
  tags. `zod` / hand-written guards at every external boundary.
- **Core is runtime-free.** No Tokio/browser/shell/HTTP/OS assumptions in `pi-core`.
  Runtime behavior lives in hosts/bindings/TS.
- **Rust owns decisions; TypeScript owns side effects.** The boundary is always a typed
  message.
- **Make invalid states unrepresentable.** Prefer `Result<T,E>` over throwing; the WASM
  surface never throws (except two artifact-read fns).
- **Errors must be useful.** `code` (machine) + `message` (human) + `details`. Never catch
  and discard.
- **Tracing over printlining.** No `console.log` in committed code.
- **Surgical changes.** Touch only what the request requires; match existing style.

---

## 9. Glossary

- **T / A** — Transcript (projected messages sent to the model) / Artifacts (full text of
  projected-away tool results). Host-owned. T ∪ A = full conversation.
- **Directive** — an `AgentAction` the core emits telling the host what side effect to
  perform (`StreamLlm`, `ExecuteTools`, `Finished`, …).
- **Handle** — u32 index into pi-host-web's `thread_local` slot table; identifies an agent
  session across synchronous WASM calls.
- **Cell** — one `run_js` execution unit. Wrapped in `(async function __webJsCell(){})()`.
- **Fuel** — QuickJS instruction-counter budget; exhausting it aborts the cell
  (`FuelExhausted`), not a wall-clock timeout.
- **refId** — `e1`..`eN` label from `dom-semantic-tree::RefAllocator`, written to the DOM
  as `data-ref-id` so `page.click('e3')` targets the snapshotted element.
- **OPFS** — Origin Private File System; backs both skills and session files.
- **Projection** — converting aged/oversized tool results into previews + artifact refs,
  to fit the context window. One-way; runs once at turn end.
- **BYOK** — Bring Your Own Key; the API key never leaves the browser except to the
  configured base URL.

---

## 10. Quick orientation by file

**Where do I…**

| …change the system prompt? | `Browsergent/src/worker/anthropic-prompts.ts` (`composeSystemPrompt`) |
| …add/change an agent tool? | `Browsergent/src/worker/agent-tools.ts` (`createAgentTools`) |
| …change how SSE is parsed? | `Browsergent/src/worker/anthropic-sse.ts` |
| …change the turn loop / directives? | `pi-oxide/pi-core/src/agent_runtime.rs` + `events.rs` |
| …change context projection? | `pi-oxide/pi-core/src/context_projection.rs` |
| …change the WASM turn API? | `pi-oxide/pi-host-web/src/host_agent_api.rs` (+ `dto.rs`) |
| …change the SDK Agent class? | `pi-oxide/pi-host-web/sdk/agent.ts` (+ `orchestration/agent-engine.ts`) |
| …add a new `page.*` browser action? | `web-js/crates/extension-js/js/src/main/runner/tools/page.ts` + `shared/registry/content-script-tools.ts` + `content-script/handlers.ts` |
| …change snapshot / refId logic? | `web-js/crates/dom-semantic-tree/src/{collect,refs,role}.rs` |
| …change the sandbox yield/resume? | `web-js/crates/web-js-core/src/{session,globals,async_resume}.rs` + `web/prelude.js` |
| …change the OPFS filesystem? | `web-js/crates/web-fs/src/opfs.rs` |
