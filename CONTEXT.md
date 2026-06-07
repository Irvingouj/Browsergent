# Browsergent — Context & Architecture

<!-- Historical lock: 2026-06-06. See docs/adr/001-acting-runtime.md for the ADR. -->

## What This Project Is

Browsergent is **Claude Code for the browser** — an AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously.

Browsergent has **two interfaces**:

1. **Agent Chat** (primary): User types a task in plain English, the agent reasons and executes.
2. **JS Playbooks** (secondary): User writes JavaScript scripts that control the browser through typed `page.*` commands.

Both interfaces share the same content-script command executor and action trace.

## Locked Decision 2026-06-06: JS Playbooks (Option A)

The codebase uses `run_js` as the LLM's acting tool and `ExtensionJsClient` (from `@pi-oxide/extension-js`) as the execution runtime.

- **Lua / piccolo WASM is not in this repo.** Historical documents in `archive/` describe a Lua-based architecture that was planned but not implemented.
- The agent's only browser tool is `run_js`. The LLM generates JavaScript code that calls `page.*` APIs.
- `@pi-oxide/extension-js` provides the sandboxed JS runtime and content-script integration.
- No in-repo Rust crates. WASM and runtime are consumed as npm packages.

## Architecture

```text
Side Panel (Preact UI)
  ├─ Chat Tab (agent loop, Anthropic API)
  ├─ JS Tab (playbook editor, ExtensionJsClient)
  └─ Shared Action Trace

Web Worker
  ├─ @pi-oxide/pi-host-web WASM (Agent state machine)
  ├─ Anthropic API call (LLM reasoning)
  │     └─ LLM's only tool: run_js -> generates JS code
  │           │
  │           ▼
  └─ relayExtjsExecution(code) -> postMessage to side panel

Side Panel Main Thread
  └─ ExtensionJsClient (singleton)
        └─ @pi-oxide/extension-js ExtensionSession
              └─ chrome.tabs.* / chrome.scripting.* / content-script

Background Service Worker
  └─ Side panel opening + tab tracking (no command routing)

Content Script (in active tab, injected by extension-js)
  ├─ DOM Snapshot (ref_id generation)
  └─ Action Executor (click, fill, select, scroll, extract)
```

### Package Boundary Map

| Directory / Package | Owns |
|---------------------|------|
| `src/background/` | Service worker entry point; side-panel opening; tab tracking |
| `src/controllers/` | Orchestration: session controller, settings controller, export controller, extjs controller, worker bridge |
| `src/errors/` | `BrowsergentError` type, error codes, normalization |
| `src/protocol/` | Worker message guards (zod/hard validation at ingress) |
| `src/sidepanel/` | Preact UI (app.tsx, components, hooks), ExtensionJsClient singleton |
| `src/state/` | Zustand store and slices: chat, agent, extjs, session, settings, trace, ui |
| `src/storage/` | IndexedDB persistence for settings, sessions, conversation history |
| `src/types/` | Canonical types: `BrowserCommand`, `BrowserResult`, `PageSnapshot`, worker messages, extjs utils |
| `src/utils/` | Markdown stream, syntax highlighting, stream logger |
| `src/worker/` | Web Worker entry point, agent loop, Anthropic provider layer, agent tools, SSE/wire parsing |
| `@pi-oxide/pi-host-web` | WASM agent core (sans-IO state machine, streaming, tool loop, session persistence) |
| `@pi-oxide/extension-js` | Sandboxed JS runtime, content-script injection, `page.*` API implementation |

### Core Principle

**LLM does reasoning, JS does acting.** The LLM's only browser tool is `run_js`. All `page.*` operations go through the sandboxed `@pi-oxide/extension-js` runtime. The LLM never touches DOM or Chrome APIs directly.

## Content-Script Boundary

The content script is provided by `@pi-oxide/extension-js` and copied into `dist/` at build time.

### Supported `page.*` Commands

The content script supports the following `BrowserCommand` kinds (defined in `src/types/browser.ts`):

- `page.snapshot` — returns URL, title, timestamp, and visible interactive elements with `ref_id`
- `page.click(refId)` — clicks an element
- `page.fill(refId, text)` — fills an input
- `page.clear(refId)` — clears an input
- `page.select(refId, value)` — selects an option
- `page.press(key)` — presses a key
- `page.scroll(direction, amount?)` — scrolls
- `page.extract(refId?)` — extracts text
- `page.url` — returns current page URL
- `page.title` — returns current page title
- `page.wait(ms)` — waits for milliseconds
- `page.goto(url)` — navigates
- `page.back`, `page.forward`, `page.reload` — navigation

### Upgrading `@pi-oxide/extension-js`

1. Bump the version in `package.json`.
2. Run `npm install`.
3. Run `npm run build` and test on a real page.
4. Check the release notes for breaking changes in the `page.*` API or `ExtensionSession` shape.

### Reporting Upstream Bugs

Content-script or `page.*` behavior bugs should be reported to the `@pi-oxide/extension-js` repository (upstream), not fixed in this repo unless the fix is a Browsergent-specific adapter issue.

## Build and Test

```bash
# Install dependencies
npm install

# Build extension
npm run build

# TypeScript check
npm run typecheck

# Unit tests (Vitest)
npm run test:unit

# E2E tests (Playwright)
npm run test

# All tests
npm run test:all
```

## Coverage Baseline

Run `npm run test:unit:coverage` to generate the report.

| Metric | Baseline (2026-06-06) |
|--------|-----------------------|
| Statements | 74.6% |
| Branches | 60.72% |
| Functions | 82.15% |
| Lines | 77.7% |

### Coverage by Module

| Module | Lines | Notes |
|--------|-------|-------|
| `types/` | 93.75% | Well covered |
| `state/slices/` | 98.46% | Good coverage |
| `storage/` | 86.92% | Good coverage |
| `controllers/` | 90.99% | Good coverage |
| `protocol/` | 96.25% | Good coverage |
| `sidepanel/` | 96.73% | Good coverage |
| `worker/` | 53.45% | Needs improvement (anthropic-model at 0%) |
| `utils/` | 47.36% | Needs improvement |

### Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `dist/`
4. Click the extension icon to open the side panel

## Historical Documents

`archive/*.md` contains historical planning documents (Lua refactor plans, state management direction, technical specs, etc.). They are kept for reference but do not describe the current codebase. See this file for the current state.
