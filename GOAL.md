# GOAL - Browsergent

## What We Are Building

Browsergent is a Chrome side panel agent that uses the current web page for the customer.

The customer opens a page, types a plain English task, watches the agent inspect and act, and can stop it at any time.

```text
Customer: "Fill the email field with test@example.com and submit."
Browsergent: snapshots page -> fills field -> clicks submit -> reports result
```

Primary product promise:

```text
"Do this on the page for me."
```

Browsergent is not only a Lua notebook, browser automation SDK, scraping framework, or Puppeteer wrapper. Chat is the primary customer interface, and Lua playbooks are a required product capability.

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
  chat, trace, status, settings

Web Worker
  pi-core WASM agent
  piccolo Lua WASM
  Anthropic provider call
  agent loop and stop/max-step lifecycle

Background Service Worker
  active tab lookup
  content-script injection
  message routing

Content Script
  DOM snapshot
  ref_id map
  typed page actions
```

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
Chat UI
pi-core WASM in Worker
Anthropic Messages API integration
activeTab + scripting permissions
Dynamic content-script injection
page_snapshot, page_click, page_fill, page_clear
page_select, page_press, page_scroll, page_extract
page_goto, page_back, page_forward, page_reload
Action trace
Stop button
Max steps, default 20
Required Lua playbook/tool mode
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

Done when the extension loads unpacked, side panel opens, Worker starts, pi-core WASM loads, and `Agent.start_turn("hello")` returns `StreamLlm`.

### M2 - Chat and LLM

Done when the customer can type a task, the Worker calls Anthropic, assistant text appears in chat, and Stop can cancel the run.

### M3 - Page Snapshot

Done when `page_snapshot` returns URL, title, timestamp, and visible interactive elements with `ref_id`, and the agent can describe the current page.

### M4 - Page Actions

Done when `page_fill`, `page_click`, `page_select`, `page_scroll`, and `page_extract` work on real test pages and invalid refs return `E_STALE`.

### M5 - Full Agent Loop

Done when the agent completes one real fill-and-submit task through `StreamLlm -> ExecuteTools -> on_tool_done -> StreamLlm -> Finished`, with trace and max-step enforcement.

### M6 - v1 Hardening

Done when tests pass, API key storage works, errors are visible, no `any`/`Object` exists in TypeScript, no `console.log` remains, and README explains build/load/test.

## Definition of Done

```text
1. Extension loads with no Chrome extension errors.
2. Side panel opens to chat, not notebook cells.
3. pi-core WASM initializes in Worker.
4. Customer can enter a task and receive an LLM response.
5. page_snapshot returns active-tab elements with ref_ids.
6. page_fill changes a real input.
7. page_click clicks a real element.
8. Every browser action appears in trace.
9. Agent completes one fill-and-submit workflow.
10. Stop interrupts a running workflow.
11. No arbitrary page JS eval.
12. No broad host permissions.
```

## Hard Rules

```text
Chat first.
Typed commands only.
ref_id only, no selectors.
activeTab only for v1.
Rust owns agent decisions.
TypeScript owns side effects.
Every action is visible.
Every boundary is typed.
No TypeScript any or Object.
```
