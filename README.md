# Browsergent

[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20OR%20Apache--2.0-blue)](./LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust → WASM](https://img.shields.io/badge/Rust-WASM-CE422B?logo=rust&logoColor=white)](https://rustwasm.github.io/)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange)](#status)
[![Website](https://img.shields.io/badge/website-browsergent.com-2b6cb0)](https://browsergent.com)

**AI browser agent for Chrome** — Claude Code for the browser. An open-source agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously.

**Site:** [browsergent.com](https://browsergent.com) · [Download](https://browsergent.com/download/) · [Docs](https://browsergent.com/docs/) · [Use cases](https://browsergent.com/use-cases/) · [FAQ](https://browsergent.com/faq/)

<video src="https://browsergent.com/demo.mp4" width="100%" controls muted playsinline poster="https://browsergent.com/demo-poster.jpg"></video>

> A 30-second demo: type a task, watch the agent reason, act, and recover.

> ⚠️ **Experimental.** Browsergent is an exploratory project. Its current philosophy is to expose everything the Chrome extension can access to the agent so we can learn the boundary of browser-agent capability. The agent may be able to read page content, cookies, auth headers, request/response metadata, and other browser-accessible data. Always review its actions and avoid using it on accounts or pages where that level of access is unacceptable. Security controls will be introduced later as the capability boundary becomes clearer.

Type a task in plain English. The agent reasons with an LLM, generates JavaScript, runs it against your Chrome tabs, observes the result, and iterates until the task is done — just like Claude Code, but for browser automation. Bring your own credentials (BYOK): Anthropic, OpenAI, ChatGPT Plus/Pro, DeepSeek, or a compatible endpoint. No remote browser farm: a sandbox runs that JavaScript and turns `page.*` / `web.tab.*` calls into typed browser commands.

---

## How it works

The LLM reasons and generates JS. Browser actions go through the sandboxed `@pi-oxide/extension-js` runtime via `run_js`. The model also has `get_doc`, `load_skill`, OPFS file tools, and an in-browser `bash` over the same files. It never touches the DOM or Chrome APIs directly — it only writes JavaScript.

```
Side Panel (Chat UI)
  │ postMessage
  ▼
Web Worker
  ├─ @pi-oxide/pi-host-web WASM (state machine, context projection)
  ├─ Provider call (Anthropic Messages, OpenAI Responses, or Chat Completions)
  │     └─ tools: run_js, get_doc, load_skill, file_*, bash
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

**Easiest:** download the prebuilt Chrome extension zip from
[browsergent.com/download](https://browsergent.com/download/), unzip it, then
**Load unpacked** in `chrome://extensions` with Developer mode on.

**From source:**

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

Open **Settings** in the side panel and add a provider. The endpoint URL is exact — the extension does not append `/v1/...` for you.

| Provider | Wire | Default endpoint |
|----------|------|------------------|
| Anthropic | Messages | `https://api.anthropic.com/v1/messages` |
| OpenAI | Responses | `https://api.openai.com/v1/responses` |
| ChatGPT Plus/Pro | Responses (Codex OAuth) | `https://chatgpt.com/backend-api/codex/responses` |
| DeepSeek | Chat Completions | `https://api.deepseek.com/chat/completions` |
| OpenAI-compatible | Chat Completions | the URL you enter |
| Anthropic-compatible | Messages | the URL you enter |

First-class providers can fetch their model list. Compatible providers take model ids by hand. ChatGPT Plus/Pro signs in with the Codex OAuth flow; the access token is stored as that provider's key and refreshed from the refresh token.

Your key stays in the browser — never sent anywhere except the endpoint you configure.

---

## Features

- **Agent chat** — natural-language tasks, multi-turn reasoning, automatic error recovery
- **`/skill:` activation** — compose-time skill palette with built-in and user-authored skills
- **`@[file:...]` attachments** — reference session files in tasks
- **Files panel** — upload, edit, and manage files backed by OPFS
- **Trace view** — expandable per-step trace with JS code blocks, result inspection, and error details
- **Multi-provider** — Anthropic, OpenAI, ChatGPT Plus/Pro, DeepSeek, or a compatible endpoint
- **In-browser bash** — `just-bash` over the same OPFS files as the Files panel and file tools
- **BYOK by design** — no inference markup; you bring your own credentials

---

## Status

Browsergent is **experimental** and under active development. It works well on forms, search, reading, and multi-step navigation, but it is not a production automation tool:

- It can misread dynamic UI (SPAs, shadow DOM, canvas).
- Actions are not transactional — a failed mid-flow click can leave the page in a partial state.
- There is no built-in spend limit; the agent will keep calling the model until the task ends or you stop it.
- Snapshot refIds (`eNNN`) are single-use within an observation; reusing a stale refId is the most common failure mode.

---

## Website

The marketing site is a static Astro app in [`website/`](./website/), deployed to GitHub Pages at [browsergent.com](https://browsergent.com).

```bash
cd website
npm install
npm run dev      # local preview
npm run build    # output → website/dist
```

Useful public URLs:

| URL | Purpose |
|-----|---------|
| https://browsergent.com/ | Product homepage |
| https://browsergent.com/download/ | Prebuilt extension zip |
| https://browsergent.com/docs/ | Architecture & setup docs |
| https://browsergent.com/use-cases/ | Practical automation scenarios |
| https://browsergent.com/faq/ | FAQ |
| https://browsergent.com/llms.txt | AI/search citation brief |
| https://browsergent.com/sitemap-index.xml | Sitemap |

---

## Limitations

- **Chrome only.** MV3 side panel + content scripts; not ported to Firefox/Safari.
- **Closing the side panel ends runs (by design).** Workers live in the side panel document. Closing the panel stops every agent run hosted there — we do **not** keep running after the panel is closed (no offscreen “survive panel close” mode).
- **In-panel “background” sessions are concurrent runs, not panel-close survival.** While a panel stays open, you can switch the chat UI to another session; the previous session’s run may continue **in the background of that open panel** (N concurrent sessions, only one is the foreground chat view). That is different from keeping work alive after the panel is gone.
- **Context window bound.** Long sessions are compacted, but very long tasks may still lose earlier detail.
- **`page.*` follows the active http(s) tab.** `chrome://` and the side panel are never the page target. `web.tab.*` can open and drive a specific tab, including a background one.

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

Dual licensed under MIT or Apache-2.0 — see [LICENSE](./LICENSE).
