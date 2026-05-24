# Browsergent

AI browser agent in a Chrome side panel.

## Two Interfaces

1. **Chat** (primary): Type a task in plain English, the agent sees the page and acts.
2. **Lua Playbooks** (required): Write Lua scripts that control the browser through typed commands.

## Architecture

```
Side Panel (Preact UI)
  ├── Agent Loop (Anthropic API, tool mapping)
  └── Lua Runtime (piccolo WASM, planned)

Background Service Worker (routing only)
  └── Content Script Injection

Content Script (in active tab)
  ├── DOM Snapshot (ref_id generation)
  └── Action Executor (click, fill, select, scroll, extract)
```

## Build

```bash
# Install dependencies
npm install

# Build WASM from pi-oxide (requires wasm-pack)
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build ../pi-oxide/pi-host-web --target web --out-dir pkg

# Build extension
./scripts/build.sh

# TypeScript check
npx tsc --noEmit
```

## Load

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `dist/`
4. Click the extension icon to open the side panel

## Test

```bash
# E2E tests (requires Chromium)
npx playwright test
```

## Type Rules

- No `any`
- No `Object`
- Discriminated unions for all tagged types
- `unknown` at boundaries, narrow immediately

## Permissions

- `activeTab` — see current tab
- `scripting` — inject content script
- `sidePanel` — show side panel
- `storage` — store API key

No broad `host_permissions`.
