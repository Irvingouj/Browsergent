# Observation-Action Safety Improvement Plan

## Overview

Browsergent currently tells the model to observe before acting, but `@pi-oxide/extension-js` does not enforce that contract: any syntactically valid `eNNN` refId can be used, old refIds remain attached to DOM elements, and a click receipt reports dispatch rather than a verified application-level effect. The Google Flights trace exposed the resulting failure mode: the agent reused one observation across several state-changing operations, confused duplicated controls, lost one-way search state, and continued reasoning from unverified assumptions. This plan introduces a tab-local, single-use observation lease for element and focus-dependent actions, strengthens target validation, makes action receipts explicit about verification, corrects API documentation and prompts, and proves the behavior in the real Chrome extension context.

### Evidence from the Google Flights trace

- The first navigation used `2025-07-15`, although the run occurred in June 2026 and the intended future date was July 15, 2026.
- The agent initially searched `snapshot_data()` using `node.tag === "combobox"`; the actual nodes had `tag: "input"` and `role: "combobox"`.
- Google Flights exposed several controls named `Done`: `e79` at the top-level search/dialog area, `e111` for origin, and `e119` for destination. The agent later described `e111` as the calendar Done control even though the snapshot identified it as origin Done.
- One `run_js` cell clicked the Ottawa option, destination Done, a date ref, and another Done without taking a new observation between state transitions. It only inspected the page after all four operations.
- The exported trace does not show evidence that `e696` represented July 15. It cannot be called fabricated with certainty because refIds persist in the DOM and output can be bounded, but the model did not verify its current semantic identity before clicking it.
- A later direct URL restored Toronto and Ottawa but also restored `Round trip`; the agent did not verify that the required one-way mode and departure date formed a complete search state before interpreting `Loading results`.
- The code comment said it would click Flights, but it clicked `e10`, which the snapshot identified as Explore; Flights was `e12`.
- `snapshot_query({ query: "flight results price" })` used an unsupported `query` key. The implementation reads `filter`; because the schema permits extra keys, the call silently returned an unfiltered snapshot.
- The generated `get_doc` output rendered parameter and return types as `undefined`, weakening the model's ability to select the correct fields and argument shapes.
- The trace contains one correctly surfaced `E_NOT_INTERACTABLE` action, but most clicks returned success receipts even when the intended Google Flights state was not established.

### Findings validated against `../web-js` at extension-js 0.9.1

- `crates/extension-js/js/src/shared/ref-id.ts` writes monotonically allocated refIds into `data-ref-id` and returns an existing attribute indefinitely. Ref validity is therefore DOM-lifetime based, not observation based.
- `crates/extension-js/js/src/content-script/handlers.ts` resolves a click target by global `data-ref-id`, calls `HTMLElement.click()`, then immediately returns `makeActionResult("click", el)`.
- `crates/extension-js/js/src/content-script/action-result.ts` sets `ok: true` without proving that the application accepted the event or transitioned to the intended state.
- `crates/extension-js/js/src/content-script/dom-utils.ts` considers an element non-interactable only when it is disabled or `aria-disabled`; it does not reject disconnected, hidden-by-ancestor, inert-by-ancestor, zero-render-box, or observation-external targets.
- `crates/extension-js/js/src/shared/snapshot-dom.ts` checks CSS visibility on the node itself but not the complete ancestor chain. Hidden widget descendants can therefore appear in snapshots and create duplicated semantic controls.
- `crates/extension-js/js/src/shared/collect-inline-snapshot.ts` bounds returned nodes but leaves previously assigned `data-ref-id` attributes in the document.
- `crates/extension-js/js/src/content-script/handlers.ts` reads only `params.filter` for `snapshot_query`; unsupported `query` input becomes an empty filter.
- Browsergent `src/worker/js-tool-prompt.ts` says refIds are snapshot-scoped, but the runtime does not enforce that statement. The same prompt also says multiple `page.*` calls may be combined and demonstrates two mutations from one snapshot, directly encouraging the trace's unsafe pattern.

### Intended outcome

Adopt the invariant `observe -> perform at most one state-sensitive action -> observe again`. A successful mutation result means only that a validated action was dispatched to the exact target observed most recently; task-level success remains unknown until a subsequent observation verifies the expected state.

## File Structure

The enforcement belongs upstream in `../web-js` because Browsergent consumes `@pi-oxide/extension-js`; Browsergent owns prompt, error presentation, dependency integration, and end-to-end product verification.

```text
../web-js/
├── crates/extension-js/js/src/content-script/
│   ├── observation-lease.ts                 <- New tab-document-local lease state and target validation
│   ├── handlers.ts                          <- Grant leases from observations; require/consume them for actions
│   ├── action-result.ts                     <- Return dispatch receipts with explicit verification semantics
│   ├── dom-utils.ts                         <- Rendered/interactable and lease-scoped label resolution checks
│   └── message-router.ts                    <- Preserve structured observation errors through the channel
├── crates/extension-js/js/src/shared/
│   ├── collect-inline-snapshot.ts           <- Return observation nodes used to create lease membership
│   ├── snapshot-dom.ts                      <- Correct hidden-ancestor and rendered-state detection
│   ├── schemas.ts                           <- Observation IDs, action receipt fields, strict query inputs
│   └── registry/
│       ├── agent-errors.ts                  <- Structured lease-required/consumed/target-changed errors
│       └── content-script-tools.ts          <- Accurate contracts, docs, notes, and examples
├── crates/extension-js/js/test/
│   ├── observation-lease.test.ts            <- Unit coverage of the lease state machine
│   ├── content-script.test.ts               <- Handler integration and per-action enforcement
│   ├── observation-nodes.test.ts            <- Hidden descendants and observed membership coverage
│   ├── snapshot-filter.test.ts              <- Strict `filter` behavior and invalid-key rejection
│   ├── action-result.test.ts                <- Dispatch-versus-verification receipt contract
│   ├── api-docs-integration.test.ts         <- Rendered types and safe examples
│   └── published-bundle-consumer.contract.test.ts
│                                               <- Published package exposes the enforced behavior
└── testcases/
    └── observation-lease/
        └── index.html                       <- Dynamic SPA-like fixture with duplicate/hidden/rerendered controls

Browsergent/
├── src/worker/
│   ├── js-tool-prompt.ts                    <- Replace multi-action examples with enforced observe-act loops
│   ├── anthropic-prompts.ts                 <- State the single-use observation invariant
│   └── agent-tools.ts                       <- Classify and explain observation errors without retry loops
├── tests/
│   ├── observation-action-safety.spec.ts    <- Real-extension E2E through side panel and run_js relay
│   ├── golden-path-fill-submit.spec.ts      <- Update golden path to observe between mutations
│   ├── recovery-tool-failure.spec.ts        <- Enable and assert recovery after lease/stale errors
│   └── unit/
│       └── agent-tools.spec.ts              <- Error classification and recovery text
├── scripts/
│   └── smoke.mjs                            <- Add a minimal enforced observe-act-observe smoke scenario
├── package.json                             <- Upgrade to the released extension-js version
└── package-lock.json                        <- Lock the verified package artifact
```

Do not copy the lease implementation into Browsergent. The content script is the authority because it owns the live document and all first-party DOM effects; Browsergent cannot reliably enforce per-tab DOM validity from the worker or side panel.

## Interfaces & Contracts

### 1. Observation lease state

Add `../web-js/crates/extension-js/js/src/content-script/observation-lease.ts` with private state scoped to the content-script document:

```typescript
export type ObservationSource =
	| "snapshot"
	| "snapshot_text"
	| "snapshot_data"
	| "snapshot_query"
	| "find";

export interface ObservedTarget {
	readonly refId: string;
	readonly element: Element;
	readonly fingerprint: TargetFingerprint;
}

export interface TargetFingerprint {
	readonly tag: string;
	readonly role: string;
	readonly name: string;
	readonly inputType?: string;
	readonly disabled: boolean;
}

export type ObservationLeaseState =
	| { readonly kind: "none" }
	| {
			readonly kind: "available";
			readonly observationId: string;
			readonly source: ObservationSource;
			readonly documentUrl: string;
			readonly targets: ReadonlyMap<string, ObservedTarget>;
			readonly activeElementRefId?: string;
	  }
	| {
			readonly kind: "consumed";
			readonly observationId: string;
			readonly action: ObservationConsumingAction;
	  };

export type ObservationConsumingAction =
	| "click"
	| "fill"
	| "type"
	| "append"
	| "select"
	| "check"
	| "hover"
	| "dblclick"
	| "scroll_to"
	| "set_files"
	| "press";

export interface ObservationLeaseController {
	grant(source: ObservationSource, nodes: ReadonlyArray<{ refId: string }>): string;
	requireTarget(params: { refId?: string; label?: string }, action: ObservationConsumingAction): Element;
	requireFocus(action: "press"): Element;
	consume(observationId: string, action: ObservationConsumingAction): void;
	invalidate(reason: ObservationInvalidationReason): void;
	current(): ObservationLeaseState;
}

export type ObservationInvalidationReason =
	| "navigation"
	| "reload"
	| "history"
	| "wait"
	| "scroll"
	| "document_changed";
```

The controller must not be exported through the agent API. It is internal content-script authority.

### 2. Lease grant contract

- `page.snapshot`, `page.snapshot_text`, and `page.snapshot_data` grant a lease containing exactly the refIds returned by that observation.
- `page.snapshot_query` grants a lease containing exactly its filtered returned nodes, not every node collected before filtering.
- `page.find` grants a lease containing exactly the returned matches because it currently promises actionable refIds. This keeps the public contract coherent while treating `find` as a targeted observation.
- A new observation replaces any earlier available or consumed lease.
- Each grant creates a unique opaque `observationId`; uniqueness only needs to hold for the current document lifetime.
- Navigation naturally creates a new content-script instance, but explicit invalidation must still occur before navigation/reload/history calls are dispatched where possible.

### 3. Target action contract

Before dispatching any element action:

```typescript
const element = lease.requireTarget(params, action);
const observationId = lease.currentObservationId();
lease.consume(observationId, action);
dispatchAction(element);
```

Consumption must occur before the browser event is dispatched. An action that throws, partially changes the page, or is ignored still consumes the lease. This prevents retries against uncertain state.

`requireTarget` must enforce all of the following:

- An available lease exists.
- A refId is a member of the latest lease, or a label resolves uniquely within latest-lease membership.
- The currently indexed element is the same `Element` object observed previously.
- `element.isConnected` is true.
- The current fingerprint matches the observed fingerprint.
- The element is rendered and not disabled/inert through itself or an ancestor.
- The current document URL matches the grant URL, excluding fragment-only changes if they do not replace the target.

Do not resolve labels by scanning the full document after a lease exists. Label lookup must be restricted to observed targets; otherwise label mode bypasses observation enforcement.

### 4. Focus and non-target actions

`press` is state-sensitive because its meaning depends on focus. A snapshot must record the active element when it belongs to the returned target set. `press` requires an available lease with a still-matching active element and consumes that lease.

These calls do not require a lease and do not consume one:

```text
url, title, active_tab, tabs/list, health, fetch, extract
snapshot, snapshot_text, snapshot_data, snapshot_query, find
```

These calls do not require a lease but invalidate any current lease because they can change page context before a later element action:

```text
goto, back, forward, reload, wait, scroll, switch/activate, new_tab, close
```

`scroll_to` without a refId/label acts like `scroll` and invalidates. `scroll_to` with a target requires and consumes a lease.

### 5. Structured errors

Extend extension-js error contracts without collapsing distinct cases into `E_NOT_INTERACTABLE`:

```typescript
export type ObservationActionErrorCode =
	| "E_OBSERVATION_REQUIRED"
	| "E_OBSERVATION_CONSUMED"
	| "E_STALE"
	| "E_NOT_INTERACTABLE"
	| "E_AMBIGUOUS_TARGET";

export interface ObservationActionError {
	readonly code: ObservationActionErrorCode;
	readonly message: string;
	readonly category: "observation" | "resource";
	readonly details?: {
		readonly refId?: string;
		readonly label?: string;
		readonly observationId?: string;
		readonly reason?:
			| "no_observation"
			| "already_consumed"
			| "not_in_latest_observation"
			| "element_replaced"
			| "fingerprint_changed"
			| "focus_changed"
			| "hidden"
			| "disabled"
			| "ambiguous_label";
	};
	readonly recovery: readonly string[];
}
```

Recovery for required, consumed, and stale observation errors must always instruct the model to take a fresh observation and select a ref from its returned nodes. It must never recommend retrying the same action first.

### 6. Action receipt semantics

Replace the implication that `ok: true` proves an intended state transition:

```typescript
export interface PageActionReceipt {
	readonly ok: true;
	readonly action: string;
	readonly refId?: string;
	readonly observationId?: string;
	readonly dispatched: true;
	readonly verification: "required";
	readonly value?: string;
	readonly checked?: boolean;
}
```

Keep `ok: true` for transport compatibility, but document it as “validated and dispatched,” never “application effect verified.” Fill/type may report the immediate DOM value, but this still does not prove framework state or task completion.

### 7. Snapshot visibility contract

`isMarkdownVisible` and action-time visibility validation must share a common rendered-state helper. The helper must check:

- `hidden`, `aria-hidden="true"`, and `inert` on the element and ancestors.
- Computed `display: none` and `visibility: hidden|collapse` on the element and ancestors.
- Whether the element has a rendered client box where appropriate.
- Disabled state on native form elements and `aria-disabled="true"`.

Do not define “visible” as “inside the viewport.” Offscreen rendered controls remain observable and can be reached via scrolling. Do not reject opacity alone without tests; applications use opacity during valid transitions.

### 8. Strict snapshot-query inputs and documentation

`PageSnapshotQueryParamsSchema` must reject unknown top-level keys such as `query` rather than silently treating them as an empty filter. The documented and executable signature remains:

```typescript
interface PageSnapshotQueryParams {
	readonly filter?: SnapshotFilter;
	readonly max_nodes?: number;
}
```

API documentation must render concrete parameter and return types. Browsergent's `ExtensionJsApiEntry` decoder and extension-js's generated JSON schema must agree on one field name (`js_type` or `type`); cover the published JSON payload rather than fixing only Markdown output.

### 9. Package boundary

Implement and release the runtime behavior in `@pi-oxide/extension-js` first. Browsergent then upgrades `package.json` and `package-lock.json` to the exact released version and must not rely on a sibling checkout at runtime or in product E2E tests.

## Key Constraints & Invariants

- Enforce observation safety in the extension content script, not only in prompts.
- Allow at most one state-sensitive action per observation lease.
- Consume the lease before dispatching an action.
- Consume the lease even when the action throws or has no observable effect.
- Never let refId or label targeting escape the latest observation's returned target set.
- Never treat an unrelated background DOM mutation as sufficient reason to invalidate the entire lease.
- Reject a target when its identity, connection, fingerprint, focus, rendered state, or disabled state changed.
- Replace the current lease whenever a new observation succeeds.
- Do not grant a lease when snapshot collection fails or detects concurrent mutation.
- Do not let a failed or truncated snapshot partially replace the previous lease; invalidate instead.
- Invalidate on navigation, history movement, reload, wait, untargeted scroll, tab switch, and document replacement.
- Keep lease state isolated per tab document; never share it through worker globals or across tabs.
- Preserve the testing invariant that all product-level behavior runs as a real Chrome extension against an HTTP(S) target tab.
- Reject `chrome-extension://` and `chrome://` targets throughout the test harness.
- Keep action receipts truthful: dispatched is not verified.
- Require a fresh observation to verify every state-changing action.
- Preserve structured error codes through content script, runner, worker relay, Browsergent trace, and model tool result.
- Never use `any` or `Object`; validate all external messages and generated docs at their boundaries.
- Do not change unrelated filesystem, provider, session, or UI behavior.
- Do not overwrite existing dirty work in either repository.

## Data Flow

### Happy path: observe, act, verify

```text
Model run_js
  -> page.snapshot_data()
  -> extension-js resolves active HTTP(S) tab
  -> content script collects bounded semantic nodes
  -> lease.grant("snapshot_data", returned nodes)
  -> returns nodes + observationId metadata
  -> model selects a returned refId
  -> page.click({ refId })
  -> content script requireTarget(refId)
       -> lease available?
       -> refId in latest returned set?
       -> same connected element and fingerprint?
       -> rendered and enabled?
  -> consume lease before HTMLElement.click()
  -> return { ok: true, dispatched: true, verification: "required" }
  -> page.snapshot_data()
  -> grant replacement lease
  -> model verifies expected page state before claiming success
```

### Failure path: second action from one observation

```text
snapshot_data() -> lease available
click(firstRef) -> lease consumed -> click dispatched
click(secondRef)
  -> requireTarget sees consumed lease
  -> E_OBSERVATION_CONSUMED
  -> no second browser event
  -> model receives "take a fresh observation"
```

This directly blocks the Google Flights sequence that selected a destination, clicked Done, clicked a date, and clicked another Done from one stale view of the page.

### Failure path: SPA rerender replaces or changes the target

```text
snapshot_data() -> lease stores Element identity + fingerprint
SPA rerender/autocomplete -> target replaced or semantic identity changes
click(oldRef)
  -> target missing, disconnected, replaced, or fingerprint mismatch
  -> E_STALE with reason
  -> lease consumed or invalidated
  -> no browser event
  -> fresh snapshot required
```

### Context-changing operation

```text
snapshot_data() -> lease available
page.scroll(...) / page.wait(...) / page.goto(...)
  -> invalidate lease
  -> perform context-changing operation
later click(oldRef)
  -> E_OBSERVATION_REQUIRED
```

## Verification Criteria

### Upstream extension-js unit and contract tests

- [ ] Before any observation, `page.click({ refId: "e1" })` returns `E_OBSERVATION_REQUIRED` and dispatches no click event.
- [ ] A successful `snapshot_data()` followed by one click dispatches exactly one event and returns `verification: "required"`.
- [ ] A second click, fill, press, or other consuming action without a new observation returns `E_OBSERVATION_CONSUMED` and produces no side effect.
- [ ] A failed first action still consumes the lease.
- [ ] A new observation after a consumed lease authorizes exactly one new action.
- [ ] A refId present in an older observation but absent from the latest observation returns `E_STALE` with reason `not_in_latest_observation`.
- [ ] A syntactically valid but never observed `e999999` returns `E_STALE`, not a generic runtime error.
- [ ] Replacing an observed DOM node while preserving similar text causes the old ref action to fail before dispatch.
- [ ] Changing an observed target's role/name/tag/input type causes fingerprint validation to fail before dispatch.
- [ ] An unrelated DOM mutation elsewhere does not invalidate a still-identical observed target.
- [ ] A target under a hidden, `aria-hidden`, inert, or `display:none` ancestor is omitted from observation and rejected at action time.
- [ ] Two visible controls with the same label produce `E_AMBIGUOUS_TARGET` for label mode; a refId from the latest observation remains deterministic.
- [ ] Label mode cannot resolve a matching element outside latest observation membership.
- [ ] `press` fails when there is no observed focused element or focus changed after observation.
- [ ] `wait`, scroll, navigation, reload, history movement, and tab activation invalidate an available lease.
- [ ] `snapshot_query({ query: "x" })` fails validation with an actionable invalid-parameter error.
- [ ] `snapshot_query({ filter: { name: "July 15" } })` returns only matching nodes and grants membership only to those returned refs.
- [ ] API JSON and Markdown docs show concrete types for `refId`, `filter`, `max_nodes`, and action receipts; none render as `undefined`.
- [ ] Published-bundle consumer tests prove the same lease behavior through the packaged entry point, not source-only imports.

### Browsergent prompt and error tests

- [ ] `JS_TOOL_PROMPT` no longer says multiple state-changing `page.*` calls may share one snapshot.
- [ ] All examples use `observe -> one action -> observe` and select by both `role` and `tag` where relevant.
- [ ] The example no longer performs fill and click from the same `snapshot_data()` result.
- [ ] The tab-targeting example no longer snapshots once and then performs multiple `web.tab.*` mutations.
- [ ] `SYSTEM_PROMPT` explicitly states that an action receipt proves dispatch only and that task success requires a later observation.
- [ ] `agent-tools.ts` preserves `E_OBSERVATION_REQUIRED`, `E_OBSERVATION_CONSUMED`, `E_AMBIGUOUS_TARGET`, and `E_STALE` without collapsing them into `E_JS_RUNTIME`.
- [ ] Recovery hints instruct a fresh observation and never recommend immediate same-ref retry.

### Real Chrome extension E2E

- [ ] Load Browsergent's built extension through Playwright with the side panel open and a separate HTTP(S) fixture as the active target.
- [ ] Drive `snapshot_data -> click -> click` through the actual `run_js` worker/main-thread/content-script relay; assert the second click fails and the fixture records only one event.
- [ ] Drive `snapshot_data -> fill -> snapshot_data -> click -> snapshot_data`; assert the complete form succeeds and the final state is verified.
- [ ] Rerender a target between snapshot and click; assert `E_STALE` appears in the trace and model-facing tool result.
- [ ] Render duplicate hidden and visible Done buttons; assert the hidden control is not returned and cannot be targeted by label.
- [ ] Switch between two HTTP(S) tabs; assert a lease from tab A cannot authorize an action in tab B.
- [ ] Keep the Browsergent side panel active during the test; assert no `page.*` operation navigates or mutates the extension page.
- [ ] Export the run and assert structured observation error code, message, action, and trace status survive serialization.

### Final gates

- [ ] In `../web-js/crates/extension-js/js`, all unit, registry, docs, bundle-consumer, typecheck, and extension build commands pass according to that repository's package scripts.
- [ ] A new `@pi-oxide/extension-js` version is published and Browsergent's lockfile resolves exactly that artifact.
- [ ] In Browsergent, `npm run typecheck` exits 0.
- [ ] In Browsergent, `npm run test:unit` exits 0.
- [ ] In Browsergent, `npm run build` exits 0.
- [ ] In Browsergent, the focused observation-action Playwright tests exit 0 against the built extension.
- [ ] In Browsergent, `npm run test:all` exits 0.
- [ ] In Browsergent, `npm run smoke` exits 0 with the target tab remaining HTTP(S).

## Implementation Notes

### Deliver in vertical slices

1. Implement the lease state machine and unit tests without wiring handlers.
2. Wire one representative action (`click`) and all observation producers; prove the real extension channel.
3. Apply the same enforcement to the remaining target and focus actions through the shared handler boundary.
4. Add visibility/fingerprint validation and the dynamic fixture.
5. Tighten `snapshot_query`, generated docs, and action receipt schemas.
6. Publish extension-js, upgrade Browsergent, then update prompts and run product E2E.

Do not begin by changing only the prompt. Prompt discipline is defense in depth; runtime enforcement is the actual correctness boundary.

### Prefer single-use leases over global mutation epochs

A global `MutationObserver` epoch that invalidates on every DOM change will make Google Flights and other SPAs nearly unusable because unrelated loading indicators, animations, recommendations, and live regions mutate continuously. Single-use leases plus target identity/fingerprint checks provide deterministic sequencing while tolerating unrelated background updates.

### Avoid exposing raw Element identity across boundaries

Store `Element` references and fingerprints only inside the content script. Worker, side panel, and WASM messages should carry opaque observation/ref identifiers and structured receipts, never DOM objects or selectors.

### Keep snapshot assignment side effects out of invalidation

Snapshot collection assigns `data-ref-id` attributes. If attribute observation is later introduced, exclude extension-owned `data-ref-id` writes or assign refs before arming mutation detection; otherwise every snapshot will invalidate itself.

### Treat semantic success as a higher-level assertion

The runtime can prove that a current, observed, rendered target received a dispatched event. It cannot generally prove that clicking Done closed the intended Google Flights dialog or that a framework committed its internal state. That proof belongs to the next observation and the agent's explicit assertion over URL, field values, dialog presence, results, or another task-specific signal.
