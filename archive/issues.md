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

## Issue 8: Chat history is wiped on every new prompt

**User report**: After typing a new message, old chat messages disappear.

**Verdict: VALID.**

`src/sidepanel/app.tsx` currently clears the transcript at the start of every chat run:

```typescript
setMessages([]);
setTrace([]);
```

That makes the UI behave like a single-shot task runner, not a chat/playbook session. From the customer's point of view, this is broken: each new prompt should append to the existing transcript so the user can see what they asked, what the assistant answered, and what browser actions happened before.

There is a second related gap: `AgentLoop.run()` starts each provider request from only the current task, so even if the UI preserves old messages, the LLM still does not receive prior chat context. The visible transcript and the model context should match unless the product explicitly shows a separate "new run" boundary.

**Expected behavior**:
- Sending a new prompt appends a new user message.
- Previous user, assistant, and system messages remain visible.
- Prior action trace remains visible or is separated by an explicit run boundary.
- The task input clears after the run starts.
- A regression test sends two prompts and asserts the first prompt and first answer remain visible after the second answer appears.
- If the product is intended to be multi-turn chat, the provider request includes relevant prior messages instead of only the newest task.

**Fix**:
- Remove `setMessages([])` from `handleRun`.
- Do not clear `trace` silently on chat runs; either preserve it or append a visible run separator.
- Clear only `taskInput` after capturing `taskInput.trim()`.
- Extend `AgentLoop.run()` or its caller to pass prior transcript into the provider message list if multi-turn context is required.

---

## Issue 9: Assistant messages are not rendered streaming

**User report**: The agent's message does not render incrementally while the model is generating.

**Verdict: VALID.**

This is observable from the implementation. `src/worker/anthropic.ts` is explicitly non-streaming:

```typescript
/**
 * Anthropic Messages API adapter for Browsergent.
 * Non-streaming for v1 simplicity.
 */
```

`src/worker/agent-loop.ts` also waits for the whole provider response before emitting an assistant message:

```typescript
const result = await callAnthropic(messages, config, this.abortController?.signal);
...
if (result.text) {
  callbacks.onMessage("assistant", result.text);
}
```

So the UI cannot stream today. It only receives one final assistant message after the HTTP request completes and the JSON body is parsed.

This is especially visible with real providers because the status changes to `waiting_for_model`, then the chat area stays unchanged until the full response arrives.

**Expected behavior**:
- As soon as the provider emits text deltas, the chat panel shows an assistant message.
- Subsequent deltas append to that same assistant message instead of creating many separate messages.
- Tool calls still work: streaming text is finalized before tool execution, and tool-use blocks are passed to pi-core after the model turn completes.
- Stop aborts the provider stream and leaves the partial assistant text visible with an interrupted status.
- A regression test uses a mocked streaming response with delayed chunks and asserts partial text appears before the final chunk.

**Fix**:
- Add streaming support to the provider adapter using `stream: true` and Server-Sent Events parsing.
- Add an `onTextDelta(delta: string)` callback or an `onMessageDelta(id, delta)` callback through `AgentLoopCallbacks`.
- In the side panel, create one assistant message when the first delta arrives, then update that message by id for later deltas.
- Preserve the final assembled text for `wasmOnLlmDone()` and provider transcript history.
- Keep a non-streaming fallback only if the configured provider does not support streaming.

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
| 8 | Chat history is wiped on every new prompt | **High** | Fix needed |
| 9 | Assistant messages are not rendered streaming | **High** | Fix needed |

**Priority fix**: Move both AgentLoop and LuaRuntime execution into the Web Worker. The worker code is already written and correct — the UI just needs to post messages instead of calling runtimes directly.
