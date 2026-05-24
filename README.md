# Browsergent

AI browser agent in a Chrome side panel with two required interfaces:

1. **Chat** (primary): Type a task in plain English, the agent sees the page and acts.
2. **Lua Playbooks** (required): Write Lua scripts that control the browser through typed commands.

Both interfaces share the same content-script BrowserCommand executor and action trace.

## Architecture

```
Side Panel (Preact UI)
  ├── Chat Tab (agent loop, Anthropic API)
  ├── Lua Tab (piccolo WASM runtime)
  └── Shared Action Trace

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

# Build WASM from pi-oxide (requires wasm-pack + wasm32-unknown-unknown target)
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build ../pi-oxide/pi-host-web --target web --out-dir pkg

# Build WASM from web-lua (piccolo Lua runtime)
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build ../web-lua/crates/piccolo-notebook-wasm --target web --out-dir pkg

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

## Use

### Chat

1. Click Settings → enter your Anthropic API key → Save
2. Navigate to any page with a form
3. Type a task like "Fill the email field with test@example.com and submit"
4. Click Run
5. Watch the trace show snapshot → fill → click
6. Click Stop to cancel at any time

### Lua Playbooks

1. Switch to the Lua tab
2. Write a playbook:
```lua
local snap = page.snapshot()
page.fill("e2", "test@example.com")
page.click("e4")
```
3. Click Run Lua
4. Watch the trace show each command

## Test

```bash
# E2E tests (14 tests)
npx playwright test

# TypeScript type check
npx tsc --noEmit
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
