# AGENTS.md

Project and behavioral guidelines for agents working in this repository.

## What This Project Is

Browsergent is **Claude Code for the browser** — an AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously.

Browsergent has **two interfaces**:

1. **Agent Chat** (primary): User types a task in plain English, agent reasons and executes. Supports `/skill:` activation and `@[file:…]` attachments.
2. **Files** (secondary): Upload and manage session files; attach them to chat tasks via `@` mentions.

Architecture:

- **Brain**: `@pi-oxide/pi-host-web` WASM (Rust sans-IO state machine), runs in a Web Worker
- **Reasoning**: Anthropic Claude (LLM) — generates JS code, does NOT call browser tools directly
- **Acting**: `run_js` via `@pi-oxide/extension-js` — the agent's ONLY tool is `run_js`, which executes JS code that calls `page.*` APIs
- **Eyes and hands**: Content script with typed command protocol — snapshot, click, fill, scroll
- **Platform**: Chrome Manifest V3 extension

Core principle: **LLM does reasoning, JS does acting.** The LLM's only browser tool is `run_js`. All `page.*` operations go through the sandboxed `@pi-oxide/extension-js` runtime.
## Testing Invariant

**Browsergent is ALWAYS tested as a real Chrome extension.** The side panel (`chrome-extension://<id>/sidepanel.html`) is the extension's own page; it is NEVER the target of `page.*` operations. The "active tab" for `page.goto` / `page.snapshot` / `page.click` is always an http(s) page tab — the site under test.

Any code that resolves "the active tab" MUST reject `chrome-extension://` and `chrome://` URLs. Navigating the side panel (e.g. `page.goto` when the side panel is active) destroys the extension UI and permanently breaks the worker↔main-thread relay. The smoke harness (`scripts/smoke.mjs`) and the `page_goto` handler in `@pi-oxide/extension-js` both enforce this.

## Project Boundaries

### 1. Type safety protects every boundary.

TypeScript side:
- **Never use `any`.** Not in function params, not in return types, not in casts.
- **Never use `Object`.** Use `Record<string, unknown>` if you need a bag of string keys.
- `unknown` is permitted — it forces the reader to narrow before use.
- Define interfaces for every message, every command, every result, every snapshot.
- Discriminated unions for tagged types (e.g. `BrowserCommand`, `RunResult`, `AgentAction`).
- Use `zod` or hand-written type guards at the boundary where external data enters (message from content script, API response, user input).

```typescript
// BAD
function handleCommand(cmd: any) { ... }
const result: Object = {};

// GOOD
type BrowserCommand =
  | { kind: "page.click"; refId: RefId }
  | { kind: "page.fill"; refId: RefId; text: string };

function handleCommand(cmd: BrowserCommand): BrowserResult { ... }
```

### 2. Core is runtime-free.

- The `@pi-oxide/pi-host-web` WASM agent core must not assume any runtime.
- No Tokio, browser, shell, filesystem, HTTP, or OS-specific assumptions in the core package.
- Core is built around traits and synchronous state transitions.
- Runtime-specific behavior belongs in host crates, bindings, or TypeScript.

### 3. Rust owns decisions, TypeScript owns side effects.

- Rust owns: typed agent core, context projection, command validation schemas, state machine transitions.
- TypeScript owns: Chrome extension APIs, DOM manipulation, message routing, UI rendering, LLM HTTP calls.
- The boundary between them is always a typed message — never a raw string, never `any`, never an unstructured bag.

### 4. JS runtime and agent core never touch the browser directly.

They emit typed commands. The `@pi-oxide/extension-js` runtime and TypeScript extension adapter own all real browser side effects:
- No direct access to `document`, `window`, `chrome.*`, `fetch`, `cookies`, `localStorage` from the agent core or sandboxed JS runtime.
- Access only through typed host functions that yield and resume through the command protocol.
- Content scripts execute DOM actions, never arbitrary JS eval.

### 5. Make invalid states unrepresentable.

- Use TypeScript discriminated unions with `kind` or `type` tags.
- Prefer `Result<T, E>` over throwing; prefer `Option<T>` over null checks.
- If a function can fail, the return type must say so.

```typescript
// BAD — null hides in the type
function getSnapshot(): PageSnapshot | null { ... }

// GOOD — the result type forces handling
type SnapshotResult = { ok: true; value: PageSnapshot } | { ok: false; error: string; code: ErrorCode };
function getSnapshot(): SnapshotResult { ... }
```

### 6. Errors must be useful.

TypeScript:
- Error types carry a `code` field (machine-readable) and a `message` field (human-readable).
- Never catch and discard. Never `.catch(() => {})`.
- Error boundaries in UI, structured errors in data flow.

### 7. Tracing over printlining.

- Trace state transitions, command dispatch, boundary crossing, and recoverable failures.
- No `console.log` left in committed code. Use `console.debug` for development, remove before merge.
- No noisy logs for obvious local assignments.

### 8. Abstraction when it clarifies, not when it feels clever.

- Use abstractions to protect boundaries, encode invariants, and remove real duplication.
- Avoid abstractions that only make single-use code more indirect.
- Three similar lines is better than a premature abstraction.

## Behavioral Rules

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### No Comments Unless Why Is Non-Obvious

- Code should explain itself through naming.
- Only comment the WHY, never the WHAT.
- No multi-paragraph docblocks on obvious functions.
- One-line comments for hidden constraints, subtle invariants, or workarounds.

## Key Type Definitions

These are the canonical types. Implement against these, not ad hoc shapes.

### BrowserCommand (TypeScript)

```typescript
type BrowserCommand =
  | { kind: "page.snapshot"; options?: SnapshotOptions }
  | { kind: "page.click"; refId: RefId }
  | { kind: "page.fill"; refId: RefId; text: string }
  | { kind: "page.clear"; refId: RefId }
  | { kind: "page.select"; refId: RefId; value: string }
  | { kind: "page.press"; key: Key }
  | { kind: "page.scroll"; direction: Direction; amount?: number }
  | { kind: "page.extract"; refId?: RefId }
  | { kind: "page.url" }
  | { kind: "page.title" }
  | { kind: "page.wait"; ms: number }
  | { kind: "page.goto"; url: string }
  | { kind: "page.back" }
  | { kind: "page.forward" }
  | { kind: "page.reload" };

type RefId = string;          // "e0", "e1", ... — branded type preferred
type Direction = "up" | "down";
type Key = "Enter" | "Tab" | "Escape" | "Backspace" | string;

interface SnapshotOptions {
  onlyVisible?: boolean;
  maxElements?: number;
}
```

### BrowserResult

```typescript
type BrowserResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code: ErrorCode; details?: Record<string, unknown> };

type ErrorCode =
  | "E_STALE"
  | "E_NOT_FOUND"
  | "E_NOT_INTERACTABLE"
  | "E_NOT_FILLABLE"
  | "E_NOT_SELECT"
  | "E_PERMISSION"
  | "E_NAVIGATION"
  | "E_UNSUPPORTED"
  | "E_UNKNOWN";
```

### PageSnapshot

```typescript
interface PageSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: ReadonlyArray<ElementSnapshot>;
}

interface ElementSnapshot {
  refId: RefId;
  role: string;
  tag: string;
  text: string;
  label?: string;
  placeholder?: string;
  value?: string;
  enabled: boolean;
  visible: boolean;
  attributes?: Record<string, string>;
}
```

### Worker Messages

```typescript
// UI → Worker
type PanelToWorker =
  | {
      type: "agentStart";
      runId: string;
      sessionId: string;
      task: string; // display-only (skill/file tokens stripped)
      resolvedTask?: string; // full prompt sent to the model
      skillCatalog?: string;
      activatedSkills?: string[];
      settings: WorkerSettings;
    }
  | { type: "agentStop"; runId?: string }
  | { type: "agentReset" }
  | { type: "extjsStop" }
  | { type: "extjsReset" }
  | { type: "extjsRunResult"; id: string; result: CellResult }
  | { type: "extjsRunError"; id: string; error: string }
  | { type: "extjsDocsResult"; id: string; docs: string }
  | { type: "extjsDocsError"; id: string; error: string }
  | { type: "loadSkillResult"; id: string; content: string }
  | { type: "loadSkillError"; id: string; error: string };

interface WorkerSettings {
  anthropicApiKey?: string;
  baseUrl?: string;
  model: string;
}

// Worker → UI
type WorkerToPanel =
  | { type: "workerReady" }
  | { type: "agentStatus"; runId: string; status: AgentStatus; reason?: string }
  | { type: "agentMessage"; runId: string; message: ChatMessage }
  | { type: "agentTextDelta"; runId: string; messageId: string; text: string }
  | { type: "agentTrace"; runId: string; entry: AgentTraceEntry }
  | { type: "agentDiagnostic"; runId: string; event: AgentDiagnosticEvent }
  | { type: "agentMessageEnd"; runId: string; messageId: string }
  | { type: "agentError"; runId: string; error: BrowsergentError }
  | { type: "extjsOutput"; id: string; output: string }
  | { type: "extjsError"; id: string; error: string }
  | { type: "extjsRunRequest"; id: string; code: string }
  | { type: "extjsDocsRequest"; id: string; format: "json" | "markdown" }
  | { type: "loadSkillRequest"; id: string; skill: string; path?: string; activatedSkills?: string[] };

type AgentStatus = "idle" | "loading" | "running" | "waiting_for_model" | "executing_tool" | "done" | "stopped" | "error";
```

## Build and Test

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Dev server
npm run dev

# Unit tests
npm run test:unit

# E2E tests
npm run test

# All tests
npm run test:all

# TypeScript check
npm run typecheck

# Load unpacked extension
# chrome://extensions → Developer mode → Load unpacked → dist/
```

## Reference Architecture

```
Side Panel (Chat UI)
  │ postMessage
  ▼
Web Worker
  ├─ @pi-oxide/pi-host-web WASM (the brain — state machine, context projection)
  ├─ Anthropic API call (LLM reasoning)
  │     └─ LLM's only tool: run_js → generates JS code
  │           │
  │           ▼
  └─ relayExtjsExecution(code) → postMessage to side panel

Side Panel Main Thread
  └─ ExtensionJsClient (singleton adapter)
        └─ @pi-oxide/extension-js ExtensionSession
              └─ chrome.tabs.* / chrome.scripting.* / content script

Background Service Worker
  │ chrome.tabs.sendMessage
  ▼
Content Script (in active tab)
  ├─ snapshot engine (ref_id generation)
  ├─ action executor (click/fill/select/scroll)
  └─ result observation
```

Core boundary: LLM reasons and generates JS code. `@pi-oxide/extension-js` executes `page.*` operations that yield typed `BrowserCommand`s. The TypeScript host executes them. The LLM never touches DOM or Chrome APIs — it only writes JS.
