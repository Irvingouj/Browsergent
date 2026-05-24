# GOAL - Browsergent

## What We Are Building

Browsergent is a Chrome side panel agent that uses the current web page for the customer.

Browsergent has **two required interfaces**:

### 1. Agent Chat (primary)

```text
Customer: "Fill the email field with test@example.com and submit."
Browsergent: LLM generates Lua code -> Lua executes page.snapshot() -> page.fill() -> page.click() -> reports result
```

The LLM's only tool is `run_lua`. It generates Lua code to interact with the browser. Lua is the execution layer.

### 2. Lua Playbooks (required)

```text
User writes:
  local snap = page.snapshot()
  page.fill("e2", "test@example.com")
  page.click("e4")
Browsergent executes typed commands through the same content-script path.
```

Primary product promise:

```text
"Do this on the page for me."
```

Browsergent is not a browser automation SDK, scraping framework, or Puppeteer wrapper. Chat is the primary interface. Lua playbooks are a required, first-class capability for power users and the agent runtime. The agent uses Lua as its execution layer — the LLM's only tool is `run_lua`.

## Customer Expectations

The customer expects Browsergent to:

```text
understand the active tab
act on visible controls without selectors
show every click, fill, scroll, navigation, and result
stay responsive while running
stop immediately when asked
ask before risky or irreversible actions
fail with a clear reason when blocked
never require DOM, CSS, JS, Lua, or extension knowledge
```

The first v1 customer win:

```text
1. Open a page with a form.
2. Open Browsergent.
3. Type: "Fill email with test@example.com and submit."
4. Browsergent snapshots the page.
5. Browsergent fills the email field.
6. Browsergent clicks submit.
7. Browsergent reports what happened.
8. The trace shows page_snapshot, page_fill, page_click.
```

## Architecture

```text
Side Panel UI
  chat, lua playbook editor, trace, status, settings

Web Worker
  pi-core WASM agent
  piccolo Lua WASM (required)
  Anthropic provider call
  agent loop and stop/max-step lifecycle
  Lua runtime with page.* API
  LLM's only tool: run_lua → Lua executes all page.* operations

Background Service Worker
  active tab lookup
  content-script injection
  message routing

Content Script
  DOM snapshot
  ref_id map
  typed page actions (shared by agent and Lua)
```

Agent execution flow: LLM generates Lua code → LuaRuntime.run() → page.* calls yield BrowserCommands → content script executes → results resume back to Lua → Lua output returns to LLM.

## Existing Assets

| Asset | Location | Use |
|-------|----------|-----|
| pi-core | `../pi-oxide/pi-core` | Agent state machine |
| pi-host-web | `../pi-oxide/pi-host-web` | WASM host/API pattern |
| Anthropic adapter | `../pi-oxide/web/src/providers/anthropic.ts` | Provider conversion reference |
| piccolo core | `../web-lua/crates/piccolo-notebook-core` | Lua runtime |
| piccolo WASM | `../web-lua/crates/piccolo-notebook-wasm` | WASM wrapper |
| extension tests | `../web-lua/web/tests` | Playwright extension reference |

Use these as references. Do not copy notebook UI or broad-permission extension behavior into Browsergent.

## v1 Scope

Build:

```text
Chrome MV3 side panel extension
Chat UI (primary)
Lua playbook UI (required)
pi-core WASM in Worker
piccolo Lua WASM in Worker (required)
Anthropic Messages API integration
activeTab + scripting permissions
Dynamic content-script injection
run_lua as LLM's only tool — LLM generates Lua code to control browser
Lua page.* API: snapshot, click, fill, clear, select, press, scroll, extract, goto, back, forward, reload
Action trace (shared by chat and Lua)
Stop button
Max steps, default 20
Lua page.* API using same BrowserCommand path (shared by agent and user playbooks)
```

Do not build in v1:

```text
broad host_permissions
cookies/bookmarks/history
multi-tab workflows
iframe or shadow DOM support
screenshot understanding
record/replay
long-term sessions
arbitrary page JS eval
LLM-authored CSS selectors
payment/purchase/destructive submission without explicit confirmation
```

## Milestones

### M1 - Extension and WASM

Done when the extension loads unpacked, side panel opens, Worker starts, pi-core WASM loads, piccolo Lua WASM loads, and `Agent.start_turn("hello")` returns `StreamLlm`.

### M2 - Chat and LLM

Done when the customer can type a task, the Worker calls Anthropic, assistant text appears in chat, and Stop can cancel the run.

### M3 - Page Snapshot

Done when `page_snapshot` returns URL, title, timestamp, and visible interactive elements with `ref_id`, and the agent can describe the current page.

### M4 - Page Actions

Done when `page_fill`, `page_click`, `page_select`, `page_scroll`, and `page_extract` work on real test pages and invalid refs return `E_STALE`.

### M5 - Full Agent Loop

Done when the agent completes one real fill-and-submit task through `StreamLlm -> ExecuteTools -> on_tool_done -> StreamLlm -> Finished`, with trace and max-step enforcement.

### M5.5 - Lua Playbooks

Done when the user can write and run a Lua playbook using `page.snapshot()`, `page.fill(ref, text)`, `page.click(ref)` that completes a real fill-and-submit task, with trace showing every command, using the same content-script BrowserCommand executor as the agent.

### M6 - v1 Hardening

Done when tests pass, API key storage works, errors are visible, no `any`/`Object` exists in TypeScript, no `console.log` remains, and README explains build/load/test.

## Definition of Done

```text
1. Extension loads with no Chrome extension errors.
2. Side panel opens to chat (primary) with Lua playbook tab.
3. pi-core WASM initializes in Worker.
4. piccolo Lua WASM initializes in Worker.
5. Customer can enter a task and receive an LLM response.
6. page_snapshot returns active-tab elements with ref_ids.
7. page_fill changes a real input.
8. page_click clicks a real element.
9. Every browser action appears in trace (agent and Lua).
10. Agent completes one fill-and-submit workflow.
11. Lua playbook completes one fill-and-submit workflow.
12. Stop interrupts a running workflow (agent and Lua).
13. No arbitrary page JS eval.
14. No broad host permissions.
```

## Hard Rules

```text
Chat first.
Lua playbooks are required, first-class.
LLM → run_lua → Lua → page.* → BrowserCommand → content script.
LLM's only browser tool is run_lua. LLM does reasoning, Lua does acting.
Typed commands only.
ref_id only, no selectors.
activeTab only for v1.
Rust owns agent decisions.
TypeScript owns side effects.
Every action is visible (agent and Lua share the trace).
Every boundary is typed.
No TypeScript any or Object.
Lua never touches DOM/chrome directly.
```
