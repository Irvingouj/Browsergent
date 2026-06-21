# Extension-JS 30-Second Timeout Diagnostic

## Status

Identified, not fixed as part of this investigation.

The current TypeScript source contains part of the required `extension-js` 0.7 API migration, but the initialization coupling that allowed relay responses to be dropped remains.

## Captured Symptoms

Source trace: `/Users/oujunyi/Documents/slow extension js.json`

- `get_doc` failed after approximately 30 seconds with `Extjs docs relay timed out after 30000ms`.
- The first `run_js` failed after approximately 30 seconds with `Extjs relay timed out after 30000ms`.
- Anthropic model requests completed in roughly one second, so model latency was not the cause.
- Extension-js later completed the requested LinkedIn navigation, URL/title reads, and snapshots successfully.
- Skill loading repeatedly failed with:

  ```text
  TypeError: this.session.fsExists is not a function
  ```

## Confirmed Causal Chain

1. Browsergent was upgraded from `@pi-oxide/extension-js` 0.5.0 to 0.7.0.
2. The captured extension build still used the old filesystem API, such as `session.fsExists(...)`.
3. Extension-js 0.7 exposes filesystem operations through `session.fs.exists(...)`, `session.fs.list(...)`, and related methods.
4. `ExtjsController.init()` awaited `getSkillService().ensureReady()` before assigning `ExtensionJsClient.relayCallback`.
5. Skill initialization failed on the obsolete filesystem call, so `relayCallback` was never assigned.
6. Extension-js itself remained operational and executed subsequent `apiDocs` and `runCell` requests.
7. `ExtensionJsClient` attempted to dispatch the successful responses, but no relay callback existed, so the responses were silently dropped.
8. The agent worker retained its pending relay promises until its fixed 30-second timers expired.

The exact 30-second delays therefore came from Browsergent's worker relay timeouts, not slow extension-js execution.

## Relevant Code

- `src/controllers/extjs-controller.ts`
  - `init()` installs `ExtensionJsClient.relayCallback` only after skill initialization succeeds.
- `src/sidepanel/extension-js-client.ts`
  - Dispatches relay responses through the optional static callback.
  - Current source uses the extension-js 0.7 `session.fs.*` API.
- `src/worker/index.ts`
  - Uses a 30,000 ms timeout for JS and API documentation relays.
- `src/skills/skill-service.ts`
  - Skill initialization performs filesystem work during extension-js controller initialization.

## Current Repository State

- `package.json` and `package-lock.json` specify `@pi-oxide/extension-js` 0.7.x.
- Current source uses `session.fs.exists(...)` rather than `session.fsExists(...)`.
- The captured console output came from a stale or transitional extension build that still contained the old call.
- `npm run typecheck` passes.
- Runtime relay readiness is still coupled to successful skill initialization.

## Required Fix

Install the relay callback immediately after the extension-js client initializes, before initializing optional skill functionality. A skill catalog failure must not disable `get_doc` or `run_js` transport.

The initialization flow should establish these boundaries independently:

1. Initialize `ExtensionJsClient`.
2. Install the worker relay callback.
3. Mark the acting runtime ready.
4. Initialize skills separately and report skill failures without disabling the acting runtime.

The response dispatcher should also fail visibly when no relay callback is installed instead of silently dropping a response.

## Missing Regression Coverage

Add a controller-level test reproducing this sequence:

1. Extension-js client initialization succeeds.
2. Skill initialization rejects.
3. A worker `extjsDocsRequest` or `extjsRunRequest` arrives.
4. The successful result is posted back to the worker without waiting for the 30-second timeout.

Existing `ExtensionJsClient` tests manually assign `relayCallback`, so they do not cover the initialization-order failure.

## Verification Criteria

- A forced skill initialization failure does not prevent `get_doc` or `run_js` from completing.
- No successful relay response can be silently discarded.
- The skill picker reports its failure independently.
- Reloading a freshly built extension no longer logs `session.fsExists is not a function`.
- The captured LinkedIn flow proceeds without either 30-second relay timeout.
