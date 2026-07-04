# Browsergent Error Classification Plan

## Goal

Stop Browsergent from over-guessing extension-js errors.

Browsergent should:

- pass through structured extension-js error fields
- avoid speculative recovery advice for opaque `TypeError`
- only suggest split/sleep/reconnect when the error code/details prove that cause
- keep narrow source-code hints that are reliably actionable

## Current Problem

File:

- `src/worker/agent-tools/run-js-tool.ts`

Bad current behavior:

- extension-js returns opaque `[runtime error] TypeError:`
- Browsergent sees `web.tab.*` in source
- Browsergent adds a broad hint saying click/navigation/reconnect likely happened

This is wrong for old trace calls like:

```js
await web.tab.url(tabId);
await web.tab.dom({ tabId, selector: "input[type='file']" });
```

Those failures are API/schema/extension-js error-quality issues, not proven click/snapshot timing issues.

## Required Behavior

Structured errors win.

If extension-js returns any of these fields, Browsergent must prefer them:

- `code`
- `hint`
- `recovery`
- `details`
- `stack`

Examples:

```text
E_INVALID_PARAMS: pass through as validation failure
E_UNTRANSPORTABLE_PARAM: pass through as transport failure
E_CONTENT_SCRIPT: content script recovery allowed
E_STALE: stale refId recovery allowed
E_OBSERVATION_REQUIRED: fresh snapshot recovery allowed
```

Opaque empty `TypeError` with `web.tab.*` source must not get split/snapshot advice by default.

Fallback hint should be neutral:

```text
The JS runtime returned an opaque TypeError without structured extension-js details. Check get_doc for the exact API name and argument shape, then retry with the documented signature.
```

## Implementation Plan

Edit:

- `src/worker/agent-tools/run-js-tool.ts`

Change `classifyErrorBase`.

Keep this order:

1. compile errors
2. timeout/fuel errors
3. known structured extension-js codes
4. `source.hint` passthrough
5. narrow source heuristics
6. neutral opaque fallback

Remove or narrow this branch:

```ts
if (isOpaqueRuntimeError && callsWebTabStar(jsSource)) {
  return {
    code: errCode ?? "E_JS_RUNTIME",
    hint: "A TypeError occurred in a web.tab.* call. This usually happens..."
  };
}
```

Replacement:

```ts
if (isOpaqueRuntimeError && callsWebTabStar(jsSource)) {
  return {
    code: errCode ?? "E_JS_RUNTIME",
    hint: "The JS runtime returned an opaque TypeError without structured extension-js details. Check get_doc for the exact API name and argument shape, then retry with the documented signature.",
  };
}
```

Only use split/snapshot guidance when:

- `errCode === "E_CONTENT_SCRIPT"`
- `errCode === "E_STALE"`
- `errCode === "E_OBSERVATION_REQUIRED"`
- or `source.details.reason` explicitly contains reconnect/navigation/stale-frame evidence

Keep these existing heuristics:

- source contains `setTimeout` or `setInterval` => use `web.sleep`
- source contains `.find(` and `.refId` => likely `find()` returned undefined

Do not add a new abstraction or classifier framework.

## Tests

Edit:

- `tests/unit/agent-tools.spec.ts`

Add/adjust tests:

1. Empty TypeError with `await web.tab.url(tabId)`:
   - code is `E_JS_RUNTIME`
   - hint does not contain `split`
   - hint does not contain `snapshot`
   - hint does not contain `reconnect`
   - hint mentions `get_doc` or exact API shape

2. Empty TypeError with `await web.tab.dom({ tabId, selector })`:
   - same assertions as above

3. Empty TypeError with `await web.tab.click(...); await web.tab.snapshot(...)`:
   - no split hint unless structured code/details indicate content-script/stale/reconnect

4. Structured `E_INVALID_PARAMS`:
   - Browsergent preserves extension-js message
   - Browsergent preserves code
   - Browsergent preserves details
   - no extra speculative hint

5. Structured `E_CONTENT_SCRIPT`:
   - Browsergent may suggest content-script refresh/reconnect recovery

6. Existing tests still pass:
   - `setTimeout` => `web.sleep`
   - `.find(...).refId` => verify match before acting
   - `page.*` active-tab hint, if current policy keeps it

## Verification

Run in `/Users/oujunyi/code/Browsergent`:

```bash
npm run typecheck
npm run test:unit -- tests/unit/agent-tools.spec.ts
npm run test:unit
```

## Done Criteria

- Browsergent no longer tells agents to split click/snapshot for `web.tab.url`.
- Browsergent no longer tells agents to split click/snapshot for `web.tab.dom`.
- Structured extension-js validation/transport errors pass through without speculative diagnosis.
- Existing reliable hints still work.
- Typecheck and unit tests pass.
