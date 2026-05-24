# Code Review Issues

## Issue 1: Lua runs in the UI thread

**Reviewer claim**: `LuaRuntime` is instantiated and run directly in the side panel UI thread (app.tsx lines 142-177). Should be in a Web Worker.

**Verdict: VALID.**

`app.tsx` line 148 creates `new LuaRuntime()` and line 158 calls `luaRuntimeRef.current.run()` directly in a Preact callback. This blocks the UI thread during:
- `run_cell()` — synchronous WASM call
- The `await callbacks.executeCommand()` in the yield/resume loop
- Any long Lua script

Meanwhile `worker/index.ts` lines 100-120 already has `handleLuaRun()` that creates `LuaRuntime` in the worker and wires up the same callbacks via `postMessage`. The worker message types (`luaRun`, `luaStop`, `luaReset`) and response types (`luaOutput`, `luaTrace`, `luaError`) are all defined. But the UI never posts `luaRun` to the worker — it calls `LuaRuntime` directly.

Same problem applies to the agent loop: `AgentLoop` also runs in the UI thread (app.tsx line 83). The agent loop does `await callAnthropic(...)` and `await callbacks.executeCommand()` directly in the Preact callback, which blocks rendering during LLM waits and tool execution.

**Fix**: Wire app.tsx to use a Web Worker via `postMessage` for both agent and Lua operations. The worker already has the handler code — the UI just needs to send messages instead of calling runtimes directly.

---

## Issue 2: Custom content script instead of dom-agent WASM

**Reviewer claim**: Built their own content script in TypeScript instead of using dom-agent WASM. Simpler but less capable — no full semantic tree, no accessible names, no ARIA states, no geometry, no path info.

**Verdict: VALID — but this is the correct choice for now.**

The content script (`src/content/index.ts`) scans `a[href], button, input, select, textarea, [role], [contenteditable='true'], [onclick]` and returns basic role/tag/text/placeholder/value. It does not include:
- Accessible name computation (uses `aria-label` attribute only)
- ARIA states (aria-checked, aria-expanded, aria-disabled, etc.)
- Bounding box / geometry
- CSS selector path
- Full semantic tree traversal

For v1 this is acceptable — the snapshot gives the LLM enough information to identify and interact with elements via ref_id. Richer snapshots can be added later without changing the protocol.

**No action needed for v1.** File as future improvement.

---

## Issue 3: `mapLuaToCommand` handles both `page_click` and `page.click` styles

**Reviewer claim**: The switch in `mapLuaToCommand` (lua-runtime.ts lines 73-116) handles both underscore (`page_click`) and dot (`page.click`) action names. The dot variants are dead code because piccolo's Rust never yields dot-notation actions.

**Verdict: PARTIALLY VALID.**

Looking at the actual code in `lua-runtime.ts` lines 78-113, the switch has cases like:
```
case "page_snapshot":
case "page.snapshot":
```

The piccolo Rust host.call system yields underscore names like `page_snapshot`, `page_click`, etc. The dot-notation variants (`page.snapshot`, `page.click`) are indeed dead code.

However, the `BROWSERGENT_PAGE_LIBRARY` in lua-runtime.ts lines 119-131 adds two custom functions via `host.call("browsergent_page_clear", ...)` and `host.call("browsergent_page_extract", ...)` which yield `host_browsergent_page_clear` and `host_browsergent_page_extract`. These are handled at lines 74-77.

**Fix**: Remove the dot-notation cases from `mapLuaToCommand`. They add dead branches that could mask bugs if action names ever diverge.

---

## Issue 4: Missing page.* API coverage

**Reviewer claim**: Only 12 of web-lua's 25 page.* actions are mapped. Missing: dblclick, type, check, hover, unhover, scroll_to, url, title, screenshot, wait, and all tab management.

**Verdict: VALID — by design for v1.**

The spec explicitly scopes v1 to: snapshot, click, fill, clear, select, press, scroll, extract, goto, back, forward, reload. Tab management, hover, screenshot, wait, etc. are v1 non-goals per GOAL.md and product-roadmap.md.

**No action needed.** Easy to add later via the same mapLuaToCommand + BrowserCommand pattern.

---

## Issue 5: page.clear and page.extract params shape consistency

**Reviewer claim**: The `BROWSERGENT_PAGE_LIBRARY` passes `{ refId = ref_id }` to `host.call`. The params shape is consistent with mapLuaToCommand reading `p.refId`.

**Verdict: VALID — no issue here.**

The Lua code in `BROWSERGENT_PAGE_LIBRARY` does:
```lua
host.call("browsergent_page_clear", { refId = ref_id })
```
This yields `params: { refId: "..." }`. Then `mapLuaToCommand` reads `p.refId`. Consistent.

---

## Issue 6: No stdin support in Lua playbook execution

**Reviewer claim**: `PanelToWorker` type has `stdin?: string` on `luaRun` but neither the UI nor the runtime uses it.

**Verdict: VALID — minor.**

Looking at the message types in `types/messages.ts`, `luaRun` does not have a `stdin` field. The reviewer may be looking at an older version. Regardless, stdin is not needed for browser automation — Lua playbooks don't read from stdin.

**No action needed.**

---

## Issue 7: Worker's handleLuaRun is dead code

**Reviewer claim**: `worker/index.ts` implements `handleLuaRun` with full `LuaRuntime` wiring, but the UI calls `LuaRuntime` directly instead of posting `luaRun` to the worker. Two parallel implementations, the worker one is unreachable.

**Verdict: VALID — same root cause as Issue 1.**

This is the same problem as Issue 1. The worker has complete handling for:
- `luaRun` → creates/inits LuaRuntime, runs code, posts back `luaOutput`/`luaTrace`/`luaError`
- `luaStop` → calls `luaRuntime.stop()`
- `luaReset` → calls `luaRuntime.reset()`

But the UI (app.tsx) creates its own `LuaRuntime` and calls it directly. The worker code is dead code because the UI never sends `luaRun` messages.

Same applies to agent: the worker has `handleAgentStart` with full `AgentLoop` wiring, but app.tsx creates `AgentLoop` directly.

**Fix**: Same as Issue 1 — wire the UI to use the worker for both agent and Lua operations.

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Lua + Agent run in UI thread, not Worker | **High** | Fix needed |
| 2 | Content script simpler than dom-agent | Low | Accepted for v1 |
| 3 | Dead dot-notation cases in mapLuaToCommand | Low | Cleanup |
| 4 | Missing page.* API coverage | Low | By design |
| 5 | Params shape consistency | None | No issue |
| 6 | No stdin support | None | Not needed |
| 7 | Worker handleLuaRun is dead code | **High** | Same fix as #1 |

**Priority fix**: Move both AgentLoop and LuaRuntime execution into the Web Worker. The worker code is already written and correct — the UI just needs to post messages instead of calling runtimes directly.
