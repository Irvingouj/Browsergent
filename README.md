# Browsergent

**Claude Code for the browser** — an AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously.

Type a task in plain English. The agent reasons with an LLM, generates JavaScript, runs it against the current page, observes the result, and iterates until the task is done — just like Claude Code, but for browser automation.

---

## Architecture

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

**Core principle:** the LLM reasons and generates JS. `run_js` is its only tool. All `page.*` operations flow through the sandboxed `@pi-oxide/extension-js` runtime. The LLM never touches DOM or Chrome APIs directly — it only writes JavaScript.

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

---

## Tech Stack

- **TypeScript** — extension host, UI (Preact + Zustand + Tailwind CSS v4), message routing
- **Rust → WASM** (`@pi-oxide/pi-host-web`) — agent state machine, context projection
- **`@pi-oxide/extension-js`** — sandboxed JS runtime; executes `run_js` and dispatches typed `page.*` commands
- **Chrome Manifest V3** — side panel, service worker, content script
- **Vitest + Playwright** — unit and end-to-end tests

---

## License

Browsergent Fair BYOK License — see [LICENSE](./LICENSE). MIT-style with BYOK and no-LLM-resale conditions.
