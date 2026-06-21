# GOAL - Browsergent

## What We Are Building

Browsergent is a Chrome side panel agent that uses the current web page for the customer.

Browsergent has **two interfaces**:

### 1. Agent Chat (primary)

```text
Customer: "Fill the email field with test@example.com and submit."
Browsergent: LLM generates JS code -> run_js executes page.snapshot() -> page.fill() -> page.click() -> reports result
```

The LLM's only tool is `run_js`. It generates JavaScript code to interact with the browser. The sandboxed JS runtime is the execution layer.

### 2. JS Playbooks (secondary)

```text
User writes:
  const tabId = await page.active_tab();
  console.log(await page.snapshot());
  await page.fill("e2", "test@example.com");
  await page.click("e4");
Browsergent executes typed commands through the same content-script path.
```

Primary product promise:

```text
"Do this on the page for me."
```

Browsergent is not a browser automation SDK, scraping framework, or Puppeteer wrapper. Chat is the primary interface. JS playbooks are a capability for power users and the agent runtime. The agent uses JS as its execution layer — the LLM's only tool is `run_js`.

**Locked decision 2026-06-06: JS Playbooks (Option A). See `docs/adr/001-acting-runtime.md` for ADR.**

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
never require DOM, CSS, JS, or extension knowledge
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
  chat, js playbook editor, trace, status, settings

Web Worker
  @pi-oxide/pi-host-web WASM agent
  Anthropic provider call
  agent loop and stop/max-step lifecycle
  JS execution relay to side panel
  LLM's only tool: run_js -> JS executes all page.* operations

Side Panel Main Thread
  ExtensionJsClient (singleton)
  @pi-oxide/extension-js ExtensionSession
  chrome.tabs.* / chrome.scripting.* / content script

Background Service Worker
  active tab lookup
  content-script injection
  message routing

Content Script
  DOM snapshot
  ref_id map
  typed page actions (shared by agent and JS playbooks)
```

Agent execution flow: LLM generates JS code -> Worker relays to ExtensionJsClient -> page.* calls yield BrowserCommands -> content script executes -> results resume back to JS runtime -> output returns to LLM.

## Existing Assets

| Asset | Location | Use |
|-------|----------|-----|
| pi-host-web | `@pi-oxide/pi-host-web` npm package | Agent state machine |
| extension-js | `@pi-oxide/extension-js` npm package | Sandboxed JS runtime + content script |
| Anthropic adapter | `src/worker/anthropic*.ts` | Provider conversion |

No in-repo Rust crates. WASM and runtime are consumed as npm packages.

## v1 Scope

Build:

```text
Chrome MV3 side panel extension
Chat UI (primary)
JS playbook UI (secondary)
@pi-oxide/pi-host-web WASM in Worker
Anthropic Messages API integration
activeTab + scripting permissions
Dynamic content-script injection
run_js as LLM's only tool — LLM generates JS code to control browser
page.* API: snapshot, click, fill, clear, select, press, scroll, extract, url, title, wait, goto, back, forward, reload
Action trace (shared by chat and JS playbooks)
Stop button
Max steps, default 20
JS execution via ExtensionJsClient using same BrowserCommand path (shared by agent and user playbooks)
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

Done when the extension loads unpacked, side panel opens, Worker starts, `@pi-oxide/pi-host-web` WASM loads, and `Agent.start_turn("hello")` returns a stream.

### M2 - Chat and LLM

Done when the customer can type a task, the Worker calls Anthropic, assistant text appears in chat, and Stop can cancel the run.

### M3 - Page Snapshot

Done when `page.snapshot()` returns URL, title, timestamp, and visible interactive elements with `ref_id`, and the agent can describe the current page.

### M4 - Page Actions

Done when `page.fill`, `page.click`, `page.select`, `page.scroll`, and `page.extract` work on real test pages and invalid refs return `E_STALE`.

### M5 - Full Agent Loop

Done when the agent completes one real fill-and-submit task through the agent loop, with trace and max-step enforcement.

### M5.5 - JS Playbooks

Done when the user can write and run a JS playbook using `page.snapshot()`, `page.fill(ref, text)`, `page.click(ref)` that completes a real fill-and-submit task, with trace showing every command, using the same content-script BrowserCommand executor as the agent.

### M6 - v1 Hardening

Done when tests pass, API key storage works, errors are visible, no `any`/`Object` exists in TypeScript, no `console.log` remains, and README explains build/load/test.

## Definition of Done

```text
1. Extension loads with no Chrome extension errors.
2. Side panel opens to chat (primary) with JS playbook tab.
3. @pi-oxide/pi-host-web WASM initializes in Worker.
4. Customer can enter a task and receive an LLM response.
5. page.snapshot returns active-tab elements with ref_ids.
6. page.fill changes a real input.
7. page.click clicks a real element.
8. Every browser action appears in trace (agent and JS).
9. Agent completes one fill-and-submit workflow.
10. JS playbook completes one fill-and-submit workflow.
11. Stop interrupts a running workflow (agent and JS).
12. No arbitrary page JS eval.
13. No broad host permissions.
```

## Hard Rules

```text
Chat first.
JS playbooks are a first-class capability.
LLM -> run_js -> JS -> page.* -> BrowserCommand -> content script.
LLM's only browser tool is run_js. LLM does reasoning, JS does acting.
Typed commands only.
ref_id only, no selectors.
activeTab only for v1.
Rust owns agent decisions.
TypeScript owns side effects.
Every action is visible (agent and JS share the trace).
Every boundary is typed.
No TypeScript any or Object.
JS runtime never touches DOM/chrome directly.
```
