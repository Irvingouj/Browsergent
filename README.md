# Browsergent

[![License: Fair BYOK](https://img.shields.io/badge/License-Fair%20BYOK-blue)](./LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust → WASM](https://img.shields.io/badge/Rust-WASM-CE422B?logo=rust&logoColor=white)](https://rustwasm.github.io/)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange)](#status)

**Claude Code for the browser** — an AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously.

> ⚠️ **Experimental (v0.1).** Browsergent is an early project. It can navigate, click, fill, and read pages, but it will make mistakes on complex flows. Always review its actions before relying on results.

Type a task in plain English. The agent reasons with an LLM, generates JavaScript, runs it against the current page, observes the result, and iterates until the task is done — just like Claude Code, but for browser automation.

---

## How it works

The LLM reasons and generates JS. `run_js` is its **only** tool. All `page.*` operations flow through the sandboxed `@pi-oxide/extension-js` runtime. The LLM never touches the DOM or Chrome APIs directly — it only writes JavaScript.

```
Side Panel (Chat UI)
  │ postMessage
  ▼
Web Worker
  ├─ @pi-oxide/pi-host-web WASM (state machine, context projection)
  ├─ Anthropic API call (LLM reasoning)
  │     └─ LLM's only tool: run_js → generates JS code
  │           │
  │           ▼
  └─ relayExtjsExecution(code) → postMessage to side panel

Side Panel Main Thread
  └─ ExtensionJsClient (singleton)
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

The side panel is the extension's own page — it is never the target of `page.*` operations. The "active tab" for `page.goto` / `page.snapshot` / `page.click` is always an http(s) page.

---

## Quick Start

```bash
git clone https://github.com/Irvingouj/Browsergent.git
cd Browsergent
npm install
npm run build
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` directory

---

## Configuration

Open **Settings** in the side panel and provide:

| Field | Example |
|-------|---------|
| API Key | `sk-ant-api03-...` |
| Base URL | `https://api.anthropic.com` |
| Model | `claude-sonnet-4-6` |

Compatible providers: **Anthropic**, **DeepSeek** (`api.deepseek.com/anthropic`), **z.ai / GLM**, or any endpoint implementing the Anthropic Messages API.

Your API key stays in the browser — never sent anywhere except the base URL you configure.

---

## Features

- **Agent chat** — natural-language tasks, multi-turn reasoning, automatic error recovery
- **`/skill:` activation** — compose-time skill palette with built-in and user-authored skills
- **`@[file:...]` attachments** — reference session files in tasks
- **Files panel** — upload, edit, and manage files backed by OPFS
- **Trace view** — expandable per-step trace with JS code blocks, result inspection, and error details
- **Multi-provider** — Anthropic, DeepSeek, GLM, or any compatible API
- **BYOK by design** — no inference markup; you bring your own credentials

---

## Status

Browsergent is **experimental (v0.1)** and under active development. It works well on forms, search, reading, and multi-step navigation, but it is not a production automation tool:

- It can misread dynamic UI (SPAs, shadow DOM, canvas).
- Actions are not transactional — a failed mid-flow click can leave the page in a partial state.
- There is no built-in spend limit; the agent will keep calling the model until the task ends or you stop it.
- Snapshot refIds (`eNNN`) are single-use within an observation; reusing a stale refId is the most common failure mode.

---

## Limitations

- **Chrome only.** MV3 side panel + content scripts; not ported to Firefox/Safari.
- **Anthropic Messages API only.** The wire layer targets the Anthropic schema; OpenAI-native function-calling is not supported.
- **No headless mode.** It drives the user's real Chrome tab; there is no detached/background automation target.
- **Context window bound.** Long sessions are compacted, but very long tasks may still lose earlier detail.
- **Single tab.** The agent operates on one active tab at a time.

---

## Development

```bash
npm install        # install dependencies
npm run dev        # dev server with hot reload
npm run build      # production build
npm run typecheck  # TypeScript check (tsc --noEmit)
npm run test:unit  # unit tests (vitest)
npm run test       # E2E tests (Playwright)
npm run test:all   # unit + E2E
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design, and [`AGENTS.md`](./AGENTS.md) for the coding conventions every contributor (human or agent) follows.

---

## Tech Stack

- **TypeScript** — extension host, UI (Preact + Zustand + Tailwind CSS v4), message routing
- **Rust → WASM** (`@pi-oxide/pi-host-web`) — agent state machine, context projection
- **`@pi-oxide/extension-js`** — sandboxed JS runtime; executes `run_js` and dispatches typed `page.*` commands
- **Chrome Manifest V3** — side panel, service worker, content script
- **Vitest + Playwright** — unit and end-to-end tests

---

## Contributing

Contributions are welcome. Before opening a PR:

1. Read [`AGENTS.md`](./AGENTS.md) — it defines the type-safety, boundary, and error-handling rules the codebase enforces.
2. Run `npm run typecheck` and `npm run test:unit` locally; both must pass.
3. Keep changes surgical — match existing style, don't refactor untouched code.
4. For behavioral changes, add or update a test that fails without your change.

---

## License

Browsergent Fair BYOK License — see [LICENSE](./LICENSE). MIT-style with BYOK and no-LLM-resale conditions.
