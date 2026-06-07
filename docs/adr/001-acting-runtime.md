# ADR 001: Acting Runtime — JS Playbooks (Option A)

**Status:** Accepted
**Date:** 2026-06-06
**Decision:** JS Playbooks (Option A)

## Context

Browsergent was originally planned with a Lua acting layer:

- The LLM's only browser tool would be `run_lua`.
- Lua code would call `page.*` APIs via `piccolo-notebook-wasm` (piccolo Lua runtime compiled to WASM).
- Both the agent and user playbooks would share the same Lua runtime.

The codebase went through several iterations:
1. Early prototype used direct BrowserCommand tools (12 tools mapped to `page_snapshot`, `page_click`, etc.).
2. A Lua refactor plan (`archive/LUA_EXTENSION_REFACTOR_PLAN.md`) proposed migrating to `@pi-oxide/extension-lua`.
3. The actual implementation today uses `@pi-oxide/extension-js` (sandboxed JavaScript runtime) with `run_js` as the LLM tool.

## Decision

**Commit to JS as the acting runtime.**

- The LLM's only browser tool is `run_js`.
- JavaScript code executes inside `@pi-oxide/extension-js`'s sandboxed `ExtensionSession`.
- The agent and user playbooks share the same `ExtensionJsClient` singleton, with serialized access through a queue.
- No Lua runtime, no piccolo WASM, no in-repo Rust crates.

## Rationale

1. **Ecosystem fit.** The `@pi-oxide` platform already shipped `extension-js` with stable `page.*` APIs, content-script injection, and Chrome API bindings. `extension-lua` was planned but not the shipped path.
2. **Simpler boundary.** Browsergent does not need to maintain a Lua-to-BrowserCommand mapping layer or a custom Lua library. The runtime handles all `page.*` calls internally.
3. **Single artifact.** One npm package (`@pi-oxide/extension-js`) provides both the sandboxed runtime and the content script. No separate WASM builds or `wasm-pack` steps in the Browsergent repo.
4. **Developer velocity.** The JS runtime is already integrated and passing tests. Pivoting to Lua would require significant re-implementation with no clear user benefit for v1.

## Consequences

### Positive
- No in-repo Rust crates or WASM build steps.
- `npm install && npm run build` is the full build.
- The `@pi-oxide/extension-js` team owns snapshot quality, click/fill reliability, and Chrome API compatibility.
- Static code scanning for forbidden APIs (`tab.evaluate`, etc.) is straightforward in JS.

### Negative
- Historical documentation (`README.md`, `GOAL.md`, `AGENTS.md`, `archive/*.md`) references Lua and must be updated to reflect JS.
- The product docs state "JS Playbooks" instead of "Lua Playbooks" — a naming change for users who read the roadmap.
- If the upstream platform later prioritizes Lua, Browsergent would need a separate migration plan.

## Alternatives Considered

| Option | Description | Rejected Because |
|--------|-------------|------------------|
| B — Commit to Lua | Add `extension-lua` package, `run_lua` tool, Lua tab UI | `extension-js` is already shipped and working; Lua would be a large re-implementation with no user benefit for v1 |
| C — Dual runtime | Both JS and Lua tabs; agent uses one canonical runtime | Doubles maintenance surface; no clear product need for both in v1 |

## Implementation

- `package.json` depends on `@pi-oxide/extension-js` and `@pi-oxide/pi-host-web`.
- `src/worker/agent-tools.ts` defines `run_js` and `get_doc` tools.
- `src/sidepanel/extension-js-client.ts` is the singleton adapter for `ExtensionSession`.
- `src/worker/index.ts` relays JS execution from the Worker to the side panel via `extjsRunRequest` / `extjsRunResult` messages.
- All documentation updated to reflect JS instead of Lua.
