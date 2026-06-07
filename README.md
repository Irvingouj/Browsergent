# Browsergent

AI browser agent in a Chrome side panel with two interfaces:

1. **Chat** (primary): Type a task in plain English, the agent sees the page and acts.
2. **JS Playbooks** (secondary): Write JavaScript scripts that control the browser through typed commands.

Both interfaces share the same content-script BrowserCommand executor and action trace.

## Architecture

```
Side Panel (Preact UI)
  ├── Chat Tab (agent loop, Anthropic API)
  ├── JS Tab (extension-js sandboxed runtime)
  └── Shared Action Trace

Web Worker
  ├── @pi-oxide/pi-host-web WASM (agent brain)
  ├── Anthropic API call (LLM reasoning)
  │     └─ LLM's only tool: run_js -> generates JS code
  └─ relay to side panel for execution

Side Panel Main Thread
  └── ExtensionJsClient (singleton)
        └─ @pi-oxide/extension-js ExtensionSession
              └─ chrome.tabs.* / chrome.scripting.* / content script

Background Service Worker
  └── Side panel opening + tab tracking

Content Script (in active tab, injected by extension-js)
  ├── DOM Snapshot (ref_id generation)
  └── Action Executor (click, fill, select, scroll, extract)
```

## Build

```bash
# Install dependencies
npm install

# Build extension
npm run build

# TypeScript check
npm run typecheck
```

## Load

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `dist/`
4. Click the extension icon to open the side panel

## Use

### Chat

1. Click Settings → enter your Anthropic API key → Save
2. Navigate to any page with a form
3. Type a task like "Fill the email field with test@example.com and submit"
4. Click Run
5. Watch the trace show snapshot → fill → click
6. Click Stop to cancel at any time

### JS Playbooks

1. Switch to the JS tab
2. Write a playbook:
```js
const tabId = await page.active_tab();
console.log(await page.url());
console.log(await page.title());
console.log(await page.snapshot());
```
3. Click Run JS
4. Watch the trace show each command

## Test

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test

# All tests
npm run test:all

# TypeScript check
npm run typecheck
```

## Permissions

- `activeTab` — see current tab
- `scripting` — inject content script
- `sidePanel` — show side panel
- `storage` — store API key

No broad `host_permissions`. No arbitrary JS eval. No CSS selectors as action interface.

## Type Rules

- No `any`
- No `Object`
- Discriminated unions for all tagged types
- `unknown` at boundaries, narrow immediately
- `Record<string, unknown>` for string-keyed bags

## Historical Documents

`archive/*.md` contains historical planning documents kept for reference. They describe earlier iterations of the product (including a planned Lua runtime) and do not reflect the current codebase. See `CONTEXT.md` for the current architecture.
