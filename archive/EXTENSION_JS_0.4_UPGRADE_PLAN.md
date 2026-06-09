# Extension-JS 0.4 Upgrade Plan

**Date:** 2026-06-07  
**Status:** Ready for implementation  
**Target package:** `@pi-oxide/extension-js@^0.4.0` (published; replaces local `^0.2.4`)  
**Related:** `MUST_FIX.md` (P0 `get_doc`, cell state semantics), `CONTEXT.md`, `ROBUSTNESS_PLAN.md` (timeout generation guard — out of scope here)

---

## Why This Plan Exists

Browsergent still depends on `@pi-oxide/extension-js@^0.2.4` and integrates against APIs/semantics that changed in **0.4.0**:

| Upstream change (web-js / extension-js 0.4) | Browsergent impact |
|---------------------------------------------|-------------------|
| `generateApiDocs()` removed; docs via `ExtensionSession.apiDocs()` in WASM | `get_doc` tool breaks in agent worker (`document is not defined`) |
| Every cell wrapped in async IIFE (`wrap_user_cell_code`) | Top-level `let`/`const` do **not** persist across `run_js` calls |
| `globalThis` persists within same session (until reset/rebuild) | MUST_FIX “preserve JS state” must be reframed |
| Implicit return on last expression line | Tool results may include `result` field, not only stdout |
| `runCellAsync` serialized on main thread (`runQueue`) | Double-queue with `ExtensionJsClient` is OK; timeout/rebuild semantics unchanged |
| Default log level `trace` | Sidepanel console noise unless lowered at init |

This plan upgrades integration and tests. It does **not** implement full `ROBUSTNESS_PLAN.md` phases 2–7.

---

## Goals

1. Upgrade to `@pi-oxide/extension-js@^0.4.0` and ship a green build.
2. Fix `get_doc` via main-thread relay to `session.apiDocs()` (dynamic, permission-aware catalog).
3. Align agent prompts and `MUST_FIX.md` with isolated-cell execution semantics.
4. Add regression tests for docs relay and cell isolation.
5. Record `extension-js` version in conversation exports (MUST_FIX P2).

## Non-Goals

- `ROBUSTNESS_PLAN.md` generation-ID / late-result suppression (separate work).
- Upstream worker-safe static docs export (relay is the correct short-term fix).
- `pi-host-web` SDK changes.
- New agent tools beyond fixing `get_doc` plumbing.
- Removing the 50k-char tool-result truncation in `agent-tools.ts` (MUST_FIX says no truncation long-term; keep as-is unless explicitly expanded).

---

## Architecture Reminder

```text
Agent Worker (agent-worker.js)
  run_js / get_doc
       │ postMessage extjsRunRequest / extjsDocsRequest
       ▼
Side Panel Main Thread
  ExtjsController → ExtensionJsClient (singleton, queue)
       │ session.runCellAsync(code)  /  session.apiDocs(format)
       ▼
extension-js internal Worker + WASM
```

**Rule:** Agent worker must never `import "@pi-oxide/extension-js"` for execution or docs. Only the sidepanel main thread owns `ExtensionSession`.

---

## Work Units

Each unit is independently reviewable. Dependencies are explicit. Do units in order unless noted.

---

### WU-1: Dependency bump and smoke build

**Priority:** P0  
**Depends on:** None  
**Effort:** Small

**Changes:**

1. `package.json`: `"@pi-oxide/extension-js": "^0.4.0"`
2. `npm install` → update lockfile.
3. `npm run typecheck && npm run build`

**Acceptance:**

- [ ] Lockfile resolves to `0.4.0` (or newer patch).
- [ ] `dist/` contains `content-script.js`, `extension_js.js`, `worker.js`, `sidepanel.js`, `agent-worker.js`.
- [ ] Extension loads unpacked in Chrome; sidepanel opens without console errors on idle.

**Files:** `package.json`, `package-lock.json`

---

### WU-2: Message protocol for docs relay

**Priority:** P0  
**Depends on:** WU-1  
**Effort:** Small

**Problem:** `get_doc` runs in agent worker but docs require `ExtensionSession.apiDocs()` on main thread.

**Add message types** in `src/types/messages.ts`:

```ts
// Panel → Worker (existing extjsRunResult path stays)
| { type: "extjsDocsResult"; id: string; docs: string }
| { type: "extjsDocsError"; id: string; error: string }

// Worker → Panel
| { type: "extjsDocsRequest"; id: string; format: "json" | "markdown" }
```

**Update guards** in `src/protocol/worker-guards.ts` for new variants.

**Acceptance:**

- [ ] Typecheck passes with exhaustive switch handling (or explicit default) everywhere messages are dispatched.
- [ ] Invalid docs messages rejected at bridge ingress.

**Files:**

- `src/types/messages.ts`
- `src/protocol/worker-guards.ts`
- `src/protocol/worker-guards.spec.ts` (extend)

---

### WU-3: ExtensionJsClient — `getApiDocs()` + docs relay handler

**Priority:** P0  
**Depends on:** WU-2  
**Effort:** Medium

**Changes in `src/sidepanel/extension-js-client.ts`:**

1. Add `getApiDocs(format: "json" | "markdown"): Promise<string>`:
   - `await this.ensureReady()`
   - Chained on existing `this.queue` (same serialization as `runJs`)
   - `return this.session!.apiDocs(format)` — for `"json"`, stringify if session returns array/object; for `"markdown"`, return string as-is.

2. Add relay handler mirroring `handleRelayRequest`:

```ts
handleDocsRelayRequest(request: { type: "extjsDocsRequest"; id: string; format: "json" | "markdown" }): void
```

3. Dispatch results via new static callback or extend `relayCallback` union:

```ts
type ExtjsRelayOut =
  | ExtjsRelayResult | ExtjsRelayError
  | { type: "extjsDocsResult"; id: string; docs: string }
  | { type: "extjsDocsError"; id: string; error: string };
```

**Changes in `src/controllers/extjs-controller.ts`:**

- Wire `handleDocsRelayRequest` from bridge (see WU-4).

**Acceptance:**

- [ ] `getApiDocs("json")` returns parseable JSON array when session ready.
- [ ] Docs call serialized with `runJs` (no concurrent session mutation).
- [ ] Errors surface as `extjsDocsError`, not thrown across postMessage.

**Files:**

- `src/sidepanel/extension-js-client.ts`
- `src/controllers/extjs-controller.ts`
- `tests/unit/extension-js-client.spec.ts` (new cases)

---

### WU-4: Worker relay for docs + bridge wiring

**Priority:** P0  
**Depends on:** WU-2, WU-3  
**Effort:** Medium

**Changes in `src/worker/index.ts`:**

1. Add `relayExtjsDocs(format)` parallel to `relayExtjsExecution`:
   - Pending map `pendingExtjsDocsRelays`
   - Timeout (reuse `EXTJS_RELAY_TIMEOUT_MS` or 60s for large catalogs)
   - `post({ type: "extjsDocsRequest", id, format })`

2. Handle `extjsDocsResult` / `extjsDocsError` in `onmessage` switch (alongside `extjsRunResult`).

3. Reject pending docs relays on `agentStop`, `agentReset`, `extjsStop`, `extjsReset` (mirror run relay cleanup).

**Changes in `src/controllers/worker-bridge.ts`:**

- On `extjsDocsRequest`: call `onExtjsDocsRequest?.(msg)` (new handler option, same pattern as `onExtjsRunRequest`).

**Changes in `src/sidepanel/components/use-app-init.ts`:**

- Pass docs handler into `WorkerBridge` constructor alongside extjs run handler.

**Acceptance:**

- [ ] Round-trip: worker `relayExtjsDocs("json")` resolves with docs string when session initialized.
- [ ] Stop/reset clears pending docs promises with explicit error.

**Files:**

- `src/worker/index.ts`
- `src/controllers/worker-bridge.ts`
- `src/sidepanel/components/use-app-init.ts`
- `tests/unit/worker-bridge.spec.ts` (extend)

---

### WU-5: Refactor `get_doc` tool (remove broken import)

**Priority:** P0  
**Depends on:** WU-4  
**Effort:** Medium

**Changes in `src/worker/agent-tools.ts`:**

1. **Delete** `getExtensionJsDocs` implementation that:
   - Sets `globalThis.window = self`
   - Imports `generateApiDocs` from `@pi-oxide/extension-js`

2. **Replace** with injected dependency:

```ts
export function createAgentTools(
  runJs: (code: string) => Promise<JsRunResult>,
  getDocs: (format: "json" | "markdown") => Promise<string>, // NEW
): AgentTools
```

3. `get_doc` handler:
   - Call `getDocs("json")` for filtering (keep existing namespace filter + markdown render helpers).
   - Keep `truncateToolResult(..., 50000)` unchanged for now.

4. **Wire in `src/worker/agent-loop.ts` or `src/worker/index.ts`:**

```ts
createAgentTools(relayExtjsExecution, relayExtjsDocs)
```

**Acceptance:**

- [ ] `get_doc({})` returns namespace index in production worker path (no `document is not defined`).
- [ ] `get_doc({ namespace: "page" })` returns filtered markdown/json.
- [ ] JSON entries include `permission` field when present in upstream catalog.

**Files:**

- `src/worker/agent-tools.ts`
- `src/worker/agent-loop.ts` or `src/worker/index.ts`
- `tests/unit/agent-tools.spec.ts` (replace `generateApiDocs` mock with `getDocs` mock)

---

### WU-6: Cell isolation — prompts and MUST_FIX alignment

**Priority:** P0  
**Depends on:** WU-1 (can parallelize with WU-2–5)  
**Effort:** Small

**Semantic contract (document verbatim for the agent):**

| Persists across `run_js` | Does not persist |
|--------------------------|------------------|
| `globalThis._bg = { ... }` | Top-level `let` / `const` / `var` |
| Same session, no reset/rebuild | After `ExtensionJsClient.stop()` / timeout rebuild |
| Logic inside one `run_js` block | Assumed bindings from a previous cell |

**Changes:**

1. **`src/worker/js-tool-prompt.ts`** — add section “Execution model”:
   - Each `run_js` is an isolated async cell.
   - Prefer one block with multiple `await`s.
   - Cross-call state → `globalThis._bg` (or re-fetch each call).
   - Last expression may appear in tool result; use `console.log` for observations.

2. **`src/worker/anthropic-prompts.ts`** — mirror short version if duplicated.

3. **`MUST_FIX.md`** — update governing principle #20–21 and verification item #6:
   - “JavaScript state persists” → “`globalThis` and session-scoped WASM state persist; cell-local bindings do not.”

4. **`CONTEXT.md`** — add “Upgrading to 0.4” subsection under extension-js upgrade steps.

**Acceptance:**

- [ ] Prompt text matches actual 0.4 runtime behavior (no implication that `const x` survives next `run_js`).
- [ ] MUST_FIX verification checklist updated.

**Files:**

- `src/worker/js-tool-prompt.ts`
- `src/worker/anthropic-prompts.ts`
- `MUST_FIX.md`
- `CONTEXT.md`

---

### WU-7: Runtime init — log level

**Priority:** P1  
**Depends on:** WU-1  
**Effort:** Trivial

**Changes in `src/sidepanel/extension-js-client.ts` `init()`:**

```ts
import { setLogLevel } from "@pi-oxide/extension-js";
// after ExtensionSession.init():
setLogLevel("error"); // or "warn" — match product preference
```

Optional: expose in settings later; not required for this plan.

**Acceptance:**

- [ ] Default sidepanel session does not flood console with `[extension-js][trace]` on idle.

**Files:** `src/sidepanel/extension-js-client.ts`

---

### WU-8: Build assets — verify worker.js after upgrade

**Priority:** P1  
**Depends on:** WU-1  
**Effort:** Small

**Current `vite.config.ts`** copies only `content-script.js` and `extension_js.js`. Bundled `ExtensionSession` resolves internal worker via `new URL("../worker.js", import.meta.url)`.

**Tasks:**

1. After WU-1 build, confirm `dist/worker.js` exists and size > 0.
2. If missing after 0.4 upgrade, extend `copy-extension-js-assets` plugin:

```ts
{ src: "node_modules/@pi-oxide/extension-js/worker.js", dest: "worker.js" }
```

3. Manual smoke: run a `run_js` cell from JS Playbook tab (`1+1`).

**Acceptance:**

- [ ] `dist/worker.js` present after build.
- [ ] JS Playbook executes code successfully.

**Files:** `vite.config.ts` (only if copy needed)

---

### WU-9: Export metadata — record extension-js version

**Priority:** P2  
**Depends on:** WU-1  
**Effort:** Small

**Changes:** Where conversation/session export is assembled (likely `src/controllers/export-controller.ts` or session export path):

```ts
packages: {
  browsergent: pkg.version,
  "pi-host-web": /* from package.json */,
  "extension-js": /* from package.json */,
}
```

**Acceptance:**

- [ ] Exported JSON includes `extension-js` version `0.4.x`.
- [ ] No API keys in export (existing invariant).

**Files:** export controller + unit test if exists

---

## Tests Matrix

Legend: **U** = Vitest unit, **E** = Playwright E2E, **M** = manual smoke

| ID | Work unit | Layer | Test file | Scenario | Expected |
|----|-----------|-------|-----------|----------|----------|
| T-01 | WU-1 | M | — | Load unpacked `dist/`, open sidepanel | No init crash |
| T-02 | WU-2 | U | `tests/unit/worker-guards.spec.ts` | Valid/invalid `extjsDocsRequest` | Guard accepts/rejects |
| T-03 | WU-3 | U | `tests/unit/extension-js-client.spec.ts` | Mock session `apiDocs("json")` | Returns JSON string |
| T-04 | WU-3 | U | `tests/unit/extension-js-client.spec.ts` | Docs + runJs both queued | Serial execution order |
| T-05 | WU-4 | U | `tests/unit/worker-bridge.spec.ts` | Worker posts `extjsDocsRequest` | Handler invoked |
| T-06 | WU-4 | U | `tests/unit/worker-bridge.spec.ts` | `extjsDocsResult` forwarded to worker | Worker promise resolves |
| T-07 | WU-5 | U | `tests/unit/agent-tools.spec.ts` | `get_doc` with mock `getDocs` | Namespace index markdown |
| T-08 | WU-5 | U | `tests/unit/agent-tools.spec.ts` | `get_doc({ namespace: "page" })` | Filtered output |
| T-09 | WU-5 | U | `tests/unit/agent-tools.spec.ts` | `getDocs` throws | Error envelope, not throw |
| T-10 | WU-5 | U | `tests/unit/agent-tools.spec.ts` | Remove `generateApiDocs` mock entirely | Tests pass |
| T-11 | WU-5 | E | `tests/streaming-persistence.spec.ts` | Existing `get_doc` turn test | Still passes (real relay) |
| T-12 | WU-6 | U | `tests/unit/agent-tools.spec.ts` | Snapshot `RUN_JS_DESCRIPTION` | Contains isolation keywords |
| T-13 | WU-6 | U | **NEW** `tests/unit/cell-isolation.spec.ts` | Document expected behavior | Static assertions on prompt strings |
| T-14 | WU-6 | E | **NEW** `tests/cell-isolation.spec.ts` | Two mocked `run_js` turns via agent | Optional if harness heavy; see note |
| T-15 | WU-7 | M | — | Run agent task after init | Console not trace-flooded |
| T-16 | WU-8 | E | `tests/extension-smoke.spec.ts` or JS playbook spec | Execute `1+1` in playbook | Output visible |
| T-17 | WU-1 | U | `tests/extension-js-types.spec.ts` | `formatJsRunResult` with `result: "2"` | Includes result in output |

### Recommended new unit test: cell isolation contract

**File:** `tests/unit/cell-isolation.spec.ts`  
**Approach:** Integration-style test against real `ExtensionJsClient` is hard in Vitest (needs chrome). Prefer:

1. **Prompt contract test** (T-12, T-13): assert prompt files contain required phrases.
2. **Relay integration test** with mocked session:
   - Mock `runCellAsync` to simulate wrap behavior (return different results for `globalThis._bg.x` vs local `let x`).
   - Two sequential `runJs` calls through client queue.

If implementing real-browser cell isolation E2E (T-14), use mock Anthropic returning two consecutive `run_js` tool calls:

```js
// call 1
globalThis._bg = { n: 1 }; "ok1"
// call 2
globalThis._bg.n + 1  // expect 2 in result

// negative:
// call 1: let x = 1;
// call 2: x  // expect runtime/undefined error
```

Mark T-14 **optional** if mock server setup is costly; T-13 + manual smoke suffices for v1.

---

## Verification Checklist (Definition of Done)

Run before marking plan complete:

```bash
cd /path/to/browsergent
npm install
npm run typecheck
npm run test:unit
npm run build
npm run test   # Playwright; at minimum T-11, T-16 must pass
```

**Functional:**

- [ ] `@pi-oxide/extension-js` resolved to `0.4.x` in lockfile.
- [ ] `get_doc({})` succeeds in agent worker (no `document is not defined`).
- [ ] `run_js` with `await page.goto(...)` + extract pattern works (regression for wasm32 fix).
- [ ] Agent prompt documents isolated cells + `globalThis` persistence.
- [ ] `MUST_FIX.md` item #6 wording updated.
- [ ] Export includes `extension-js` version (WU-9).

**Regression guards:**

- [ ] Do **not** call `session.reset()` between agent tool calls.
- [ ] Do **not** reintroduce `generateApiDocs` or worker-side `@pi-oxide/extension-js` import for docs.
- [ ] `ExtensionJsClient` remains singleton.

---

## File Touch List (Quick Reference)

| File | WUs |
|------|-----|
| `package.json`, `package-lock.json` | 1 |
| `src/types/messages.ts` | 2 |
| `src/protocol/worker-guards.ts` | 2 |
| `src/sidepanel/extension-js-client.ts` | 3, 7 |
| `src/controllers/extjs-controller.ts` | 3 |
| `src/controllers/worker-bridge.ts` | 4 |
| `src/sidepanel/components/use-app-init.ts` | 4 |
| `src/worker/index.ts` | 4, 5 |
| `src/worker/agent-tools.ts` | 5 |
| `src/worker/agent-loop.ts` | 5 |
| `src/worker/js-tool-prompt.ts` | 6 |
| `src/worker/anthropic-prompts.ts` | 6 |
| `MUST_FIX.md`, `CONTEXT.md` | 6 |
| `vite.config.ts` | 8 |
| export controller | 9 |
| `tests/unit/agent-tools.spec.ts` | 5 |
| `tests/unit/extension-js-client.spec.ts` | 3 |
| `tests/unit/worker-bridge.spec.ts` | 4 |
| `tests/unit/worker-guards.spec.ts` | 2 |
| `tests/unit/cell-isolation.spec.ts` | 6 (new) |
| `tests/streaming-persistence.spec.ts` | 5 (verify) |

---

## Handoff Notes for Implementer Agent

1. **Read first:** `CONTEXT.md`, `MUST_FIX.md` (P0 items), `src/worker/index.ts` relay pattern (~lines 57–95), `src/sidepanel/extension-js-client.ts`.
2. **Do not** fix upstream in `web-js`; all changes stay in `browsergent`.
3. **Prefer minimal diffs:** mirror existing `extjsRunRequest` / `extjsRunResult` naming for docs relay.
4. **`createAgentTools` signature change** is breaking for tests — update all call sites in one commit.
5. If Playwright E2E is flaky, ensure **unit coverage for T-07–T-10** is green; report E2E failures with logs.
6. After completion, append to this file:

```markdown
## Implementation Log

- **Date:**
- **Agent:**
- **extension-js version:**
- **Tests:** unit X/Y, e2e A/B
- **Deviations:**
```

---

## Dependency Graph

```text
WU-1 ─┬─► WU-2 ─► WU-3 ─► WU-4 ─► WU-5
      ├─► WU-6
      ├─► WU-7
      ├─► WU-8
      └─► WU-9
```

WU-6/7/8/9 can proceed in parallel once WU-1 lands. **Critical path:** WU-1 → WU-2 → WU-3 → WU-4 → WU-5 (fixes P0 `get_doc`).
