# Browsergent Structure & Testing Plan

**Date:** 2026-06-06  
**Status:** Assessment + actionable backlog  
**Related:** `ROBUSTNESS_PLAN.md` (runtime failure recovery — separate but overlapping)

---

## Executive Summary

| Area | Verdict | Notes |
|------|---------|-------|
| **Code structure** | **Good foundation, needs hygiene** | Clear layering (`controllers` / `state` / `worker` / `sidepanel` / `types` / `protocol` / `storage`). Typed boundaries are real, not aspirational. |
| **Unit tests** | **Solid** | 139 tests / 18 files, all green. Strong on state slices, storage, worker guards, session controller. |
| **E2E tests** | **Broken** | 23 of 37 Playwright tests time out. Infrastructure exists but the suite is not trustworthy today. |
| **CI** | **Missing** | No `.github/workflows`. Regressions are invisible until someone runs tests locally. |
| **Documentation** | **Stale** | `README.md`, `GOAL.md`, and `AGENTS.md` describe Lua/piccolo WASM and in-repo Rust crates; the codebase uses `@pi-oxide/extension-js` with `run_js`. |
| **Product completeness** | **Gap vs GOAL** | Lua Playbooks tab (required in `GOAL.md`) is not implemented. JS execution via extension-js is the current acting layer. |

**Bottom line:** The TypeScript architecture is well-structured for an extension of this size. Testing is strong at the unit layer but weak at the integration/E2E layer, and there is no automation enforcing quality. Documentation and product docs do not match the code.

---

## Current State Snapshot

```
src/          54 TypeScript files (~3,500 LOC)
tests/        29 spec files (18 unit + 11 E2E)
              Unit:  139 passed
              E2E:   14 passed, 23 failed (timeouts)
CI:           none
Coverage:     not measured
```

### What is well-structured today

1. **Layered responsibilities** — UI (`sidepanel`), orchestration (`controllers`), state (`state/slices`), agent loop (`worker`), persistence (`storage`), and wire protocol (`protocol/worker-guards.ts`) are separated cleanly.
2. **Typed message boundaries** — `BrowserCommand`, worker messages, and zod/guard validation at ingress are implemented and tested (`worker-guards.spec.ts`).
3. **Testable core logic** — Redux-style slices and controllers are unit-tested without a browser.
4. **E2E harness** — `tests/helpers.ts` launches a real Chromium extension context with mock Anthropic server support.

### What is not well-structured or tested today

1. **Documentation drift** — Onboarding docs describe a different product (Lua WASM in-repo) than what ships (JS via npm package).
2. **E2E suite reliability** — Majority of UI/integration tests fail with 30s timeouts; likely init/race/settings-selector issues, not assertion failures.
3. **No CI gate** — `typecheck`, `test:unit`, `build`, and `test` are never run automatically.
4. **Untested critical paths** — Provider layer (`anthropic.ts`, `anthropic-sse.ts`, `anthropic-wire.ts`), `ExtensionJsClient`, `background/index.ts`, and all Preact UI components have zero direct tests.
5. **Recovery plan incomplete** — `ROBUSTNESS_PLAN.md` phases 2–7 largely unimplemented; recovery E2E files do not exist.
6. **Config orphan** — `vitest.config.ts` includes `tests/real-provider-smoke.spec.ts` which does not exist.
7. **Product gap** — Required Lua Playbooks interface from `GOAL.md` is absent; decision on JS-vs-Lua product direction is undocumented.

---

## Work Units

Each unit is independently shippable. Dependencies are noted. Every unit has explicit acceptance criteria.

---

### WU-1: Align documentation with actual architecture

**Priority:** P0  
**Effort:** Small (1–2 days)  
**Depends on:** None (but WU-10 decision should inform Lua sections)

**Problem:** New contributors and agents follow `AGENTS.md` / `README.md` / `GOAL.md` and build the wrong mental model.

**Deliverables:**

1. Update `README.md` build/test instructions to match `package.json` scripts and `@pi-oxide` npm deps (remove references to `../pi-oxide` and `../web-lua` local wasm-pack unless those are still required).
2. Update `AGENTS.md` to describe the real stack:
   - Brain: `@pi-oxide/pi-host-web` WASM in worker
   - Acting: `run_js` → `ExtensionJsClient` → `@pi-oxide/extension-js` → content script
   - No in-repo Rust crates
3. Add `CONTEXT.md` at project root with:
   - Current architecture diagram (ASCII)
   - Package boundary map (`src/*` owns what; `@pi-oxide/*` owns what)
   - Explicit note on JS vs Lua product status and decision date
4. Mark `archive/*.md` as historical in `README.md` or add a one-line header to each archived doc.

**Acceptance criteria:**

- [ ] A new developer can `npm install && npm run build && npm run test:unit` using only `README.md` without hitting missing paths.
- [ ] `AGENTS.md` contains zero references to `run_lua`, `piccolo-notebook-wasm`, or in-repo `crates/` unless marked "planned/not implemented".
- [ ] `CONTEXT.md` exists and accurately describes every top-level `src/` directory.
- [ ] `GOAL.md` either updated to reflect JS execution or clearly marked "target state" with a link to WU-10 decision.

---

### WU-2: Fix E2E test infrastructure and make suite green

**Priority:** P0  
**Effort:** Medium (3–5 days)  
**Depends on:** None

**Problem:** 23/37 Playwright tests time out. The suite cannot gate releases.

**Deliverables:**

1. Diagnose root cause of timeouts (start with `extension-smoke.spec.ts` settings test and `session-management.spec.ts`).
2. Add diagnostic artifacts on failure: screenshot + `data-initialized` state + console errors from side panel.
3. Fix `launchExtension()` helper if init race is the cause (e.g. wait for worker ready signal, not just `data-initialized`).
4. Increase timeout only where legitimately needed (streaming tests); fix underlying waits elsewhere.
5. Ensure `npm run build` runs before E2E in CI (WU-3) and document in README.

**Acceptance criteria:**

- [ ] `npm run build && npm run test` exits 0 locally on a clean checkout.
- [ ] All 11 existing E2E spec files pass (37 tests total, or documented skips with issue links).
- [ ] No test relies on `test.setTimeout` > 60s without a comment explaining why.
- [ ] `tests/helpers.ts` logs side-panel console errors on test failure.

---

### WU-3: Add CI pipeline

**Priority:** P0  
**Effort:** Small (1 day)  
**Depends on:** WU-2 (E2E green or E2E temporarily scoped)

**Problem:** No automated quality gate on push/PR.

**Deliverables:**

1. `.github/workflows/ci.yml` with jobs:
   - `typecheck` — `npm run typecheck`
   - `lint` — `npx biome check .` (if clean; otherwise `biome check` with current baseline)
   - `unit` — `npm run test:unit`
   - `build` — `npm run build`
   - `e2e` — `npm run test` (Chromium installed via Playwright action)
2. Cache `node_modules` via `actions/setup-node` + lockfile hash.
3. Upload Playwright report artifact on E2E failure.

**Acceptance criteria:**

- [ ] CI runs on `push` to `main` and on all PRs.
- [ ] PR cannot merge with failing `typecheck`, `unit`, or `build` jobs.
- [ ] E2E job runs and passes (or is explicitly `continue-on-error: false` only after WU-2).
- [ ] CI completes in < 15 minutes on a typical PR.

---

### WU-4: Remove config orphans and add coverage baseline

**Priority:** P1  
**Effort:** Small (1 day)  
**Depends on:** WU-3

**Problem:** `vitest.config.ts` references a missing file; no visibility into untested code.

**Deliverables:**

1. Remove `tests/real-provider-smoke.spec.ts` from `vitest.config.ts` **or** add the file as an opt-in manual test (`describe.skip` by default, requires `ANTHROPIC_API_KEY`).
2. Add `@vitest/coverage-v8` and `npm run test:unit:coverage` script.
3. Add `coverage/` to `.gitignore`.
4. Document baseline coverage % in `CONTEXT.md` (no hard threshold yet — establish baseline first).

**Acceptance criteria:**

- [ ] `npm run test:unit` runs without referencing missing files.
- [ ] `npm run test:unit:coverage` produces an HTML report.
- [ ] Baseline line coverage % is recorded in `CONTEXT.md`.
- [ ] CI uploads coverage artifact (optional) or prints summary in logs.

---

### WU-5: Unit-test the provider and streaming layer

**Priority:** P1  
**Effort:** Medium (3–4 days)  
**Depends on:** WU-4

**Problem:** `src/worker/anthropic*.ts` and `llm-streamer.ts` have no direct tests. Provider bugs become E2E-only discoveries.

**Deliverables:**

Unit tests for:

| Module | Minimum test cases |
|--------|-------------------|
| `anthropic-sse.ts` | Valid SSE parse; malformed event → `E_PROVIDER_BAD_STREAM`; partial stream abort |
| `anthropic-wire.ts` | Request body shape; tool_use block serialization |
| `anthropic.ts` | Error classification (401, 429, 500, network); retry only on retryable codes |
| `llm-streamer.ts` | Delta accumulation; finalize on `end_turn` |
| `sdk-message-conversion.ts` | Extend existing spec: tool error preservation (`is_error: true`) |

**Acceptance criteria:**

- [ ] New spec file per module (or grouped `tests/unit/anthropic-provider.spec.ts`).
- [ ] All provider error codes in `browsergent-error.ts` have at least one unit test mapping.
- [ ] Malformed SSE never produces a successful assistant message (unit level).
- [ ] Coverage on `src/worker/anthropic*.ts` ≥ 80% line coverage.

---

### WU-6: Unit-test ExtensionJsClient and extjs relay

**Priority:** P1  
**Effort:** Medium (2–3 days)  
**Depends on:** None

**Problem:** `ExtensionJsClient` is the only browser-acting runtime. Timeout, queue, and generation-guard behavior are untested at unit level (only slice transitions in `runtime-supervisor.spec.ts`).

**Deliverables:**

1. Extract testable pure functions from `extension-js-client.ts` where possible (generation ID, queue semantics).
2. Mock `@pi-oxide/extension-js` session in unit tests.
3. Test cases:
   - Serialized execution through queue
   - Timeout rejects and triggers rebuild state transitions
   - Late result from stale generation is ignored
   - `cancelCurrentExecution` clears pending work
   - Init failure surfaces `E_RUNTIME_NOT_READY`

**Acceptance criteria:**

- [ ] `tests/unit/extension-js-client.spec.ts` exists with ≥ 8 cases.
- [ ] Timeout path does not resolve the outer promise after rejection (no double-settle).
- [ ] `extjs-slice` transitions are driven by real client events, not only manual store calls.
- [ ] Tests run without Playwright/Chromium.

---

### WU-7: Unit-test remaining controllers and thin modules

**Priority:** P2  
**Effort:** Small–Medium (2 days)  
**Depends on:** WU-4

**Problem:** Several modules have zero test coverage.

**Deliverables — add specs for:**

| Module | Focus |
|--------|-------|
| `export-controller.ts` | Exports valid JSON/markdown for a fixture conversation |
| `extjs-controller.ts` | Wires client to store; handles relay messages |
| `normalize-error.ts` | Maps unknown errors to `BrowsergentError` |
| `trace-slice.ts` | Append, clear, status transitions |
| `ui-slice.ts` | Settings/session panel toggles |
| `selectors.ts` | Memoization correctness (snapshot test of selector outputs) |
| `background/index.ts` | Message routing (mock `chrome.*` APIs) |

**Acceptance criteria:**

- [ ] Each listed module has a corresponding `tests/unit/*.spec.ts`.
- [ ] `background/index.ts` tested with mocked `chrome.runtime` (no real extension).
- [ ] Line coverage on `src/controllers/` ≥ 70%.

---

### WU-8: Add one golden-path E2E test (fill-and-submit)

**Priority:** P1  
**Effort:** Medium (2 days)  
**Depends on:** WU-2

**Problem:** No E2E test proves the core product promise from `GOAL.md`: agent completes a real fill-and-submit workflow on a test page.

**Deliverables:**

1. `tests/golden-path-fill-submit.spec.ts`:
   - Load extension
   - Open test HTML form page
   - Configure mock Anthropic to return `run_js` tool call that fills email and clicks submit
   - Assert: trace shows snapshot → fill → click; form submitted state visible
2. Reuse mock server from `helpers.ts`; no real API key.

**Acceptance criteria:**

- [ ] Test passes in CI without network access (mock provider only).
- [ ] Trace contains at least 3 entries with expected action kinds.
- [ ] Test completes in < 20s.
- [ ] Documented in README under Test section as "golden path".

---

### WU-9: Implement ROBUSTNESS_PLAN recovery E2E matrix

**Priority:** P2  
**Effort:** Large (5–7 days)  
**Depends on:** WU-2, WU-5, WU-6, and corresponding ROBUSTNESS_PLAN phases

**Problem:** `ROBUSTNESS_PLAN.md` defines 7 recovery scenarios and 4 spec files that do not exist.

**Deliverables:**

Create the spec files named in `ROBUSTNESS_PLAN.md`:

- `tests/recovery-tool-failure.spec.ts`
- `tests/recovery-runtime.spec.ts`
- `tests/recovery-provider.spec.ts`
- `tests/recovery-stop.spec.ts`

Each file covers the scenarios listed in ROBUSTNESS_PLAN Phase 7.

**Acceptance criteria:**

- [ ] All 7 scenarios from `ROBUSTNESS_PLAN.md` Phase 7 have a corresponding E2E test.
- [ ] `npm run test` includes recovery suite and passes.
- [ ] `ROBUSTNESS_PLAN.md` file paths updated (`extension-lua-client.ts` → `extension-js-client.ts`).
- [ ] Recovery trace entries visible in UI assertions (not only internal state).

---

### WU-10: Product direction — Lua Playbooks vs JS Playbooks

**Priority:** P1 (decision), P2 (implementation)  
**Effort:** Decision: 1 meeting. Implementation: Large if Lua required.  
**Depends on:** None for decision

**Problem:** `GOAL.md` and `README.md` state Lua Playbooks are **required**. The codebase has no Lua tab, no piccolo WASM, and uses `run_js` / `JS_TOOL_PROMPT`.

**Options:**

| Option | Description |
|--------|-------------|
| A | **Commit to JS** — Update product docs; rename "Lua Playbooks" → "JS Playbooks" everywhere; add a JS editor tab in side panel. |
| B | **Commit to Lua** — Add piccolo WASM integration, `run_lua` tool, Lua tab UI, shared `page.*` API through Lua bindings. |
| C | **Dual** — Both tabs; agent uses one canonical runtime (likely Lua per original architecture). |

**Deliverables:**

1. Decision recorded in `docs/adr/001-acting-runtime.md` (create `docs/adr/` directory).
2. Update `GOAL.md`, `README.md`, `AGENTS.md` to match decision.
3. If Option A: implement JS Playbooks tab (editor + run + trace) as WU-10a.
4. If Option B/C: create separate implementation plan (out of scope for this doc).

**Acceptance criteria (decision):**

- [ ] ADR exists with chosen option, rationale, and consequences.
- [ ] No doc in repo claims Lua is required unless Option B/C chosen.
- [ ] Agent tool name in docs matches code (`run_js` or `run_lua`).

**Acceptance criteria (Option A — JS Playbooks tab):**

- [ ] Side panel has a JS tab with editor, Run, and Stop.
- [ ] JS playbook execution uses same `ExtensionJsClient` and trace as agent.
- [ ] E2E test: user script fills a form field on test page.

---

### WU-11: Component-level UI tests (lightweight)

**Priority:** P3  
**Effort:** Medium (2–3 days)  
**Depends on:** WU-4

**Problem:** `ChatPanel`, `MessageBubble`, `InputBar`, `SettingsForm`, `SessionPanel`, `TraceEntryCompact` have no tests. UI regressions are caught only by slow E2E.

**Deliverables:**

1. Add `@testing-library/preact` (or preact-render-to-string snapshot tests).
2. Test critical rendering paths:
   - `MessageBubble` renders user/assistant/system roles
   - `InputBar` disables Run when agent is running
   - `SettingsForm` validates empty API key
   - `TraceEntryCompact` shows error status styling

**Acceptance criteria:**

- [ ] `npm run test:unit` includes ≥ 10 component tests.
- [ ] Component tests run in < 2s total.
- [ ] No snapshot tests for entire app tree (targeted components only).

---

### WU-12: Own or document the content-script boundary

**Priority:** P2  
**Effort:** Small (doc) or Large (fork extension-js)  
**Depends on:** WU-1

**Problem:** `content-script.js` is copied from `@pi-oxide/extension-js` at build time. Browsergent cannot fix snapshot/action bugs without upstream changes.

**Deliverables (minimum — documentation):**

1. In `CONTEXT.md`, document:
   - Which `page.*` commands the content script supports
   - How to bump `@pi-oxide/extension-js` version
   - Where to report upstream bugs

**Deliverables (optional — ownership):**

1. Vendor or fork content script into `src/content-script/` if customization is needed.
2. Add `tests/content-script.spec.ts` coverage for every `BrowserCommand` kind in `src/types/browser.ts`.

**Acceptance criteria (minimum):**

- [ ] `CONTEXT.md` lists content-script owner and upgrade path.
- [ ] `browser-commands.spec.ts` covers all command kinds defined in `BrowserCommand` type.

**Acceptance criteria (ownership path):**

- [ ] Content script source lives in repo.
- [ ] `vite.config.ts` bundles it instead of copying from `node_modules`.

---

## Recommended Execution Order

```text
Phase 0 — Trust (week 1)
  WU-2  Fix E2E suite
  WU-3  Add CI
  WU-1  Align docs (can parallel)

Phase 1 — Coverage foundations (week 2)
  WU-4  Coverage baseline
  WU-10 Decision: JS vs Lua (unblocks doc finalization)
  WU-5  Provider unit tests
  WU-6  ExtensionJsClient unit tests

Phase 2 — Product proof (week 3)
  WU-8  Golden-path E2E
  WU-7  Remaining controller tests
  WU-12 Content-script boundary doc

Phase 3 — Hardening (week 4+)
  WU-9  Recovery E2E matrix (implements ROBUSTNESS_PLAN)
  WU-11 Component tests
  WU-10a JS Playbooks tab (if Option A chosen)
```

---

## Definition of Done (project-level)

Browsergent can be called **well-structured and well-tested** when:

```bash
npm run typecheck   # 0 errors
npm run test:unit   # 100% pass, coverage baseline documented
npm run build       # dist/ valid extension
npm run test        # 100% pass (all E2E including golden path + recovery)
```

And:

1. `CONTEXT.md` and `AGENTS.md` match the code.
2. CI enforces all four commands on every PR.
3. Golden-path E2E proves fill-and-submit works end-to-end.
4. Provider, ExtensionJsClient, and worker relay have unit tests.
5. Product direction (JS vs Lua) is decided and documented in an ADR.
6. `ROBUSTNESS_PLAN.md` recovery matrix is implemented and green (stretch goal for "well-tested").

---

## Out of Scope for This Plan

- Multi-provider LLM support
- UI redesign
- Broad permission model changes
- In-repo Rust/WASM crates (current architecture delegates to `@pi-oxide` packages)
- Performance benchmarking

---

## Appendix: Module → Test Coverage Map

| Source module | Unit tests | E2E indirect |
|---------------|-----------|--------------|
| `state/slices/*` | Yes (most slices) | Some |
| `storage/*` | Yes | Some |
| `controllers/session-controller` | Yes | Yes (failing) |
| `controllers/worker-bridge` | Partial (crash only) | Yes |
| `controllers/settings-controller` | Yes | Yes (failing) |
| `controllers/export-controller` | **No** | No |
| `controllers/extjs-controller` | **No** | Partial |
| `protocol/worker-guards` | Yes | — |
| `worker/agent-loop` | Partial (trace) | Yes |
| `worker/agent-tools` | Yes | Yes |
| `worker/anthropic*` | **No** | Partial (mock) |
| `worker/llm-streamer` | **No** | Partial |
| `sidepanel/extension-js-client` | **No** | Yes |
| `sidepanel/components/*` | **No** | Yes (failing) |
| `background/index` | **No** | Smoke only |
| `utils/*` | **No** | No |
| Content script (`@pi-oxide`) | — | Yes (browser-commands) |
