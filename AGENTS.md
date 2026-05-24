# AGENTS.md

Project and behavioral guidelines for agents working in this repository.

## What This Project Is

Browsergent is **Claude Code for the browser** — an AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously.

- **Interface**: Chat. User types a task in plain English, agent reasons and executes.
- **Brain**: pi-core (Rust sans-IO state machine), compiled to WASM, runs in a Web Worker
- **Reasoning**: Anthropic Claude (LLM streaming)
- **Eyes and hands**: Content script with typed command protocol — snapshot, click, fill, scroll
- **Lua**: Required playbook/tooling capability. NOT the main interface, but not optional.
- **Platform**: Chrome Manifest V3 extension

## Project Boundaries

### 1. Type safety protects every boundary.

Rust side:
- Parse information at the first Rust boundary.
- Do not pass unstructured strings deeper than necessary.
- Even when the wire format is a string, wrap parsed values in concrete domain structs.
- Prefer typed APIs over ad hoc `serde_json::Value` plumbing inside core logic.

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

- The Rust agent core (piccolo-notebook-core, pi-core) must not assume any runtime.
- No Tokio, browser, shell, filesystem, HTTP, or OS-specific assumptions in core crates.
- Core is built around traits and synchronous state transitions.
- Runtime-specific behavior belongs in host crates, bindings, or TypeScript.

### 3. Rust owns decisions, TypeScript owns side effects.

- Rust owns: typed agent core, Lua VM, context projection, command validation schemas, state machine transitions.
- TypeScript owns: Chrome extension APIs, DOM manipulation, message routing, UI rendering, LLM HTTP calls.
- The boundary between them is always a typed message — never a raw string, never `any`, never an unstructured bag.

### 4. Lua and Rust agent core never touch the browser directly.

They emit typed commands. The TypeScript extension adapter owns all real browser side effects:
- No direct access to `document`, `window`, `chrome.*`, `fetch`, `cookies`, `localStorage`.
- Access only through typed host functions that yield and resume through the command protocol.
- Content scripts execute DOM actions, never arbitrary JS eval.

### 5. Make invalid states unrepresentable.

- Use Rust enums to make impossible states impossible.
- Use TypeScript discriminated unions with `kind` or `type` tags.
- Prefer `Result<T, E>` over throwing; prefer `Option<T>` over null checks.
- If a function can fail, the return type must say so.

```rust
// BAD — caller must remember to check
fn execute(cmd: &BrowserCommand) -> BrowserResult { ... }

// GOOD — caller cannot ignore the error case
fn execute(cmd: &BrowserCommand) -> Result<BrowserOutput, BrowserError> { ... }
```

```typescript
// BAD — null hides in the type
function getSnapshot(): PageSnapshot | null { ... }

// GOOD — the result type forces handling
type SnapshotResult = { ok: true; value: PageSnapshot } | { ok: false; error: string; code: ErrorCode };
function getSnapshot(): SnapshotResult { ... }
```

### 6. Errors must be useful.

Rust:
- Use `thiserror` for concrete error types.
- Preserve actionable context in errors.
- Avoid opaque string-only failures once data has crossed into Rust.

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

### BrowserCommand (TypeScript ↔ Rust)

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
  | { kind: "page.goto"; url: string }
  | { kind: "page.back" }
  | { kind: "page.forward" }
  | { kind: "page.reload" };

type RefId = string;          // "e0", "e1", ... — branded type preferred
type Direction = "up" | "down";
type Key = "Enter" | "Tab" | "Escape" | "Backspace" | string;
```

### BrowserResult

```typescript
type BrowserResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code: ErrorCode };

type ErrorCode =
  | "E_STALE"
  | "E_NOT_FOUND"
  | "E_NOT_INTERACTABLE"
  | "E_NOT_FILLABLE"
  | "E_NOT_SELECT"
  | "E_PERMISSION"
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
}
```

### Worker Messages

```typescript
// UI → Worker
type WorkerRequest =
  | { type: "runCell"; id: CellId; code: string; stdin?: string }
  | { type: "resumeCell"; id: CellId; result: string }
  | { type: "stop" }
  | { type: "reset" }
  | { type: "agentStart"; task: string; maxSteps: number }
  | { type: "agentStop" };

// Worker → UI
type WorkerResponse =
  | { type: "result"; id: CellId; data: RunResult }
  | { type: "asyncRelay"; id: CellId; command: AsyncCommand }
  | { type: "agentTrace"; step: number; command: BrowserCommand; result: BrowserResult }
  | { type: "agentStatus"; status: AgentStatus; reason?: string };

type AgentStatus = "running" | "done" | "error" | "stopped";
type CellId = string;
```

## Build and Test

```bash
# Build WASM (piccolo notebook)
wasm-pack build crates/piccolo-notebook-wasm --target web --out-dir web/pkg

# Build WASM (pi-core agent)
wasm-pack build crates/browsergent-agent --target web --out-dir web/pkg-agent

# Dev server
cd web && npm run dev

# Extension build
./scripts/build-extension.sh

# Run E2E tests
cd web && npx playwright test

# Run Rust tests
cargo test --workspace

# Load unpacked extension
# chrome://extensions → Developer mode → Load unpacked → dist/
```

## Reference Architecture

```
Side Panel (Chat UI)
  │ postMessage
  ▼
Web Worker
  ├─ pi-core Agent WASM (the brain — state machine, context projection)
  ├─ piccolo Lua WASM (required playbook/tooling runtime)
  │
  │ chrome.runtime.sendMessage
  ▼
Background Service Worker (router)
  │ chrome.tabs.sendMessage
  ▼
Content Script (in active tab)
  ├─ snapshot engine (ref_id generation)
  ├─ action executor (click/fill/select/scroll)
  └─ result observation
```

Core boundary: Agent emits typed tool calls. TypeScript host executes them. The agent never touches DOM or chrome APIs.
