# `page.setFiles` Runtime Failure: Diagnosis and Fix Plan

## Status

Confirmed, deterministic, and not fixed.

This document records the failure captured in:

- `/Users/oujunyi/Downloads/browsergent-conversation-1782019261183.json`
- The Chrome side-panel console log captured on 2026-06-21
- Browsergent `0.1.0` using `@pi-oxide/extension-js@0.10.2` and `@pi-oxide/pi-host-web@0.9.3`

The failure is triggered when an agent calls `page.setFiles` with a VFS `path` for a file that already existed before the current `run_js` cell.

## User-Visible Failure

The agent successfully navigates and observes the target form, finds the uploaded resume at `/user/Software_Engineer_Resume__1_.pdf`, and calls:

```javascript
await page.setFiles({
  refId: "e12",
  files: [{ path: "/user/Software_Engineer_Resume__1_.pdf" }],
});
```

The call fails with:

```text
Uncaught Error: recursive use of an object detected which would lead to unsafe aliasing in rust
```

The runtime then becomes permanently unavailable:

```text
ExtensionJsClient not initialized. Call init() first.
```

This disables more than browser automation. Page APIs, API docs, Files operations, skill discovery, and the skill picker all share the same `ExtensionJsClient` and fail afterward.

Refreshing the target web page cannot recover this state. The target content script is not the component that failed.

## Confirmed Causal Chain

```text
pre-existing VFS file
  -> run_js calls page.setFiles({ files: [{ path }] })
  -> extension-js resolves the path while runCellAsync owns the WASM session
  -> resolver calls fsReadBase64 on that same ExtensionSession
  -> wasm-bindgen rejects the recursive mutable use
  -> Browsergent catches the run failure and calls rebuildSession()
  -> rebuildSession clears session and initialized but retains initPromise
  -> init() awaits the old resolved promise instead of creating a new session
  -> ExtensionJsClient remains uninitialized
  -> all later runtime, Files, docs, and skill calls fail
```

The console supports this sequence precisely:

1. Initial `init_start`, `startWorker_posted_init`, and `init_ready` succeed.
2. `runCell_failed` reports unsafe aliasing for run `tx-64380207-6`.
3. No second `init_start` occurs.
4. Skill refresh and picker calls immediately fail with `ExtensionJsClient not initialized`.
5. `pi-host-web` continues streaming because the reasoning worker is independent of the failed acting runtime.

## Root Cause 1: Re-entrant VFS Read in `web-js`

### Relevant files

- `../web-js/crates/extension-js/js/src/worker/worker.ts`
- `../web-js/crates/extension-js/js/src/worker/resolve-set-files.ts`
- `../web-js/crates/extension-js/js/src/main/session/extension-session.ts`
- `../web-js/crates/extension-js/src/vfs_write_cache.rs`
- `../web-js/crates/extension-js/src/browser_api.rs`

`maybeResolveSetFilesParams` in `worker.ts` first checks two write-through caches. If neither contains the requested path, it obtains the `readBase64` worker handler and invokes it. That handler calls `ExtensionSession.fsReadBase64` while `ExtensionSession.runCellAsync` is still active on the same WASM object.

The write-through caches only hide the defect when a file is written and uploaded in a compatible flow. Files placed in VFS before the cell, including files uploaded through Browsergent's Files UI, miss those caches and take the unsafe fallback.

This is why the resume reliably reproduces the error while the current contract test passes.

## Root Cause 2: Broken Browsergent Session Rebuild

### Relevant files

- `src/sidepanel/extension-js-client.ts`
- `src/controllers/extjs-controller.ts`
- `src/skills/skill-service.ts`
- `tests/unit/extension-js-client.spec.ts`
- `tests/unit/extjs-controller.spec.ts`

`ExtensionJsClient.executeWithTimeout` rebuilds the session after any non-timeout exception. `rebuildSession` clears:

```text
session
runnerPromise
initialized
```

It does not clear `initPromise` before calling `init()`.

Because `initPromise` still points to the already-resolved initial initialization, `init()` awaits it and returns without constructing a new `ExtensionSession`. The health check is skipped because `session` is still null, but the store is incorrectly marked ready.

This is a separate Browsergent defect. It must be fixed even after the upstream aliasing bug is removed because any future non-timeout runtime exception would trigger the same failed recovery.

## Why Existing Tests Pass

### `web-js`

Relevant tests:

- `../web-js/crates/extension-js/js/test/resolve-set-files.test.ts`
- `../web-js/web/tests/e2e/extension/file-upload-form.spec.ts`

The resolver unit tests mock `readBase64`, so they cannot expose WASM re-entry.

The extension E2E VFS test fetches data, calls `fs.writeBase64`, and calls `page.setFiles` in the same generated cell. This exercises a cached path, not a file that existed before `runCellAsync` began.

Missing scenario:

1. Create a file through the public main-thread `ExtensionSession.fs.writeBase64` API or the extension Files flow.
2. Start a separate `runCellAsync` call.
3. Call `page.setFiles` with that pre-existing path.
4. Verify upload content and verify that the next cell still runs.

### Browsergent

Relevant test:

- `tests/unit/extension-js-client.spec.ts`

The current 28 tests pass, but they do not assert that a non-timeout `runCellAsync` rejection creates a genuinely new, healthy session. They therefore miss the stale `initPromise` state.

## Implementation Plan

### 1. Add the failing upstream extension test

Change:

- `../web-js/web/tests/e2e/extension/file-upload-form.spec.ts`
- Supporting extension harness files only if required

Test the real extension context and public APIs:

1. Write a binary fixture to VFS before the upload cell starts.
2. Run a cell that observes the file input and calls `page.setFiles({ path })`.
3. Assert the page received the expected filename and byte count.
4. Run a second basic cell and assert the runtime remains healthy.

The test must fail with the current unsafe-aliasing error before implementation changes.

### 2. Remove re-entrant session access from path resolution

Change primarily:

- `../web-js/crates/extension-js/js/src/worker/worker.ts`
- `../web-js/crates/extension-js/js/src/worker/resolve-set-files.ts`

The resolver must obtain bytes without invoking another method on the active `ExtensionSession` from inside its async callback.

Required properties:

- Works for arbitrary pre-existing VFS files, not only recently written cache entries.
- Preserves the public `page.setFiles({ files: [{ path }] })` contract.
- Does not move first-party file upload to `chrome.scripting.executeScript`.
- Keeps file bytes inside extension-owned typed boundaries.
- Returns a structured `E_INVALID_PARAMS` or filesystem error for missing/unreadable paths.
- Does not add an unbounded duplicate in-memory file store.

The implementation should use a worker-owned VFS read route that is independent of the borrowed QuickJS/WASM session. If the current VFS ownership makes that impossible, change the internal boundary so path bytes are prepared before entering `runCellAsync`; do not rely on the write cache as the source of truth.

### 3. Add focused upstream unit coverage

Change:

- `../web-js/crates/extension-js/js/test/resolve-set-files.test.ts`
- Worker tests near `maybeResolveSetFilesParams`, if present or added at the existing worker test boundary

Cover:

- Pre-existing path resolves to bytes.
- Missing path returns a structured error.
- URL and fetch-handle sources remain unchanged.
- Multiple mixed sources preserve order and names.
- A failed upload does not poison the following cell.

### 4. Fix Browsergent's rebuild state machine

Change:

- `src/sidepanel/extension-js-client.ts`

Before starting replacement initialization, clear every field belonging to the old initialization attempt, including `initPromise`. Initialization should publish the new session atomically only after both session creation and runner startup succeed.

Required postconditions:

- A non-timeout runtime exception rejects the current `runJs` call.
- Exactly one replacement session is created.
- `isReady` is false during replacement and true only after the new session passes its health check.
- A subsequent `runJs`, docs, Files, and skill call succeeds without reloading the extension.
- Concurrent callers share the replacement initialization rather than creating multiple sessions.
- A replacement failure leaves a retryable, internally consistent state.

Do not report `extjsReady` when `session` is null.

### 5. Add Browsergent recovery regression tests

Change:

- `tests/unit/extension-js-client.spec.ts`
- `tests/unit/extjs-controller.spec.ts` only for controller-visible state assertions

Add tests that:

1. Initialize the client.
2. Make the active session reject `runCellAsync` with a non-timeout error.
3. Assert the original call returns that error.
4. Assert a new `ExtensionSession` was constructed exactly once.
5. Assert the new session health check ran.
6. Assert the next `runJs` succeeds.
7. Assert concurrent Files or skill refresh calls wait for recovery and then succeed.
8. Assert failed recovery does not produce a false ready state.

### 6. Add a real Browsergent extension regression

Change likely:

- Existing Browsergent Playwright extension harness under `tests/` or `scripts/`
- Use the established smoke harness rather than adding a second browser framework

Scenario:

1. Load Browsergent as an unpacked Chrome extension.
2. Upload a PDF or binary fixture through the Files interface.
3. Open an HTTP form with an `<input type="file">`.
4. Execute the same `page.setFiles({ path })` shape generated in the captured conversation.
5. Verify the target page sees the file.
6. Execute another page call and list skills.
7. Verify the acting runtime and skill picker remain operational.

The side panel must remain the extension UI and must never become the target of `page.*` operations.

### 7. Correct recovery messaging

Relevant files:

- Agent instructions assembled in the Browsergent worker/provider layer
- Error normalization near `src/errors/normalize-error.ts`
- Runtime status/state code used by the side panel

An `E_JS_RUNTIME` unsafe-aliasing or initialization failure must not be presented as a content-script problem. Refreshing the target tab is irrelevant.

The error should distinguish:

- `E_CONTENT_SCRIPT`: target tab needs navigation or refresh.
- `E_JS_RUNTIME`: acting runtime failed and Browsergent is rebuilding it.
- Rebuild failure: extension runtime remains unavailable and the target page is not the cause.

This work follows the functional fixes and must not substitute for them.

## Verification Commands

From `../web-js`:

```bash
cd crates/extension-js/js
npx vitest run test/resolve-set-files.test.ts

cd ../../../web
npm run test:e2e:extension -- file-upload-form.spec.ts
```

From Browsergent:

```bash
npx vitest run tests/unit/extension-js-client.spec.ts
npx vitest run tests/unit/extjs-controller.spec.ts
npm run typecheck
npm run build
npm run test:unit
npm run test
```

The final E2E gate must run in a real unpacked Chrome extension, with an HTTP target tab active.

## Acceptance Criteria

- A file uploaded through Browsergent Files can be passed to `page.setFiles({ path })` in a later cell.
- No unsafe-aliasing or recursive-use error occurs.
- The uploaded file's name and bytes are verified on the target page.
- A failed `run_js` call cannot permanently disable `ExtensionJsClient`.
- Runtime recovery constructs and health-checks a fresh session exactly once.
- Files, docs, skills, and browser APIs work after recovery without extension reload.
- The UI never reports ready while the runtime session is null.
- Errors distinguish runtime failure from content-script disconnection.
- Unit tests and real extension E2E tests reproduce the original failure before the fix and pass afterward.
- No test bypasses the real public flow with direct DOM mutation, arbitrary eval, or a cache-only fixture setup.

## Non-Goals

- PDF text extraction. The failing PDF is only the binary upload fixture.
- Changes to `pi-host-web` streaming. Continued model streaming is expected and is not the cause.
- Changes to Rippling or site-specific automation.
- Refactoring unrelated runtime, Files, skill, or content-script code.
- Treating a target-page refresh as runtime recovery.

