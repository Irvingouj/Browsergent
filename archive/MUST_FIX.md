# Must Fix

Evidence source: `browsergent-conversation-slightly better.json`, captured after upgrading `@pi-oxide/pi-host-web` to `0.9.0`.

The upgraded core successfully completed a 71-tool first turn and a 7-tool second turn. Continuous tool execution is working. Approximately 80-105K characters of model context after 70 calls is acceptable for this product and is not a defect.

## Governing Principle: Maximize Agent Power

Browsergent exists to give the agent broad, durable control of the browser and extension environment.

The following constraints are mandatory:

- No tool-call count limit.
- No arbitrary turn-step limit.
- No forced early stopping because a run is long.
- No context truncation solely to reduce cost.
- No tool-result truncation in diagnostic exports.
- No hiding APIs merely because the current host has not granted a permission yet.
- No automatic sandbox reset between tool calls or user turns.
- globalThis and session-scoped WASM state persist across executions; cell-local bindings (top-level let/const/var) do not.
- Prefer explicit errors and recoverable capability acquisition over removing power.
- The agent decides when it has gathered enough evidence and when the task is complete.

Budgets may exist only for hard platform safety requirements such as browser process stability. They must be observable, configurable, and high enough not to interfere with legitimate autonomous work.

## P0: Fix `get_doc` in the Worker

The agent is instructed to inspect documentation before using unfamiliar APIs, but `get_doc` currently fails with:

```text
document is not defined
```

Current integration imports the extension-js package root from a Web Worker:

- `src/worker/agent-tools.ts`

Required behavior:

- Consume a worker-safe, data-only extension-js documentation entrypoint.
- Do not fake `window`, `document`, or other browser globals in the worker.
- Return the complete available API catalog, including APIs that may require additional permissions.
- Include exact signatures, argument forms, result shapes, required permissions, and runnable examples.

Acceptance criteria:

- `get_doc({})` succeeds in the production agent worker.
- Namespace-filtered documentation succeeds.
- Documentation accurately matches the installed extension-js version.
- Importing docs does not initialize DOM, content-script, Chrome, or execution-runtime modules.

## P0: Preserve Typed Tool Failure Semantics End-to-End

Browsergent currently represents recoverable tool failures as successful string outputs containing an error envelope. This causes conflicting state:

- Trace status: `error`
- Model tool result: error
- Core tool call status: `completed`

Relevant code:

- `src/worker/agent-tools.ts`
- `src/worker/tool-error-result.ts`
- `src/worker/sdk-message-conversion.ts`
- `src/worker/agent-loop.ts`

Required behavior:

- Tool execution must return or throw through the SDK's typed failure contract.
- Error code, message, details, recovery hint, stdout, and stderr must survive every boundary.
- Recoverable failure must not terminate the agent loop.
- The model must receive a real error tool result and remain free to retry indefinitely or choose another approach.

Acceptance criteria:

- Core, trace, diagnostics, and model context agree on tool status.
- A failed tool call can be followed by any number of recovery calls.
- Tests cover compile, runtime, navigation, permission, timeout, relay, and validation failures.

## P1: Keep the Full API Surface and Make Capability Failures Actionable

The agent should see the complete API surface. Do not remove cookies, bookmarks, history, notifications, storage, scripting, tab, page, side-panel, filesystem, network, or other tools from discovery merely because a permission is currently absent.

Required behavior:

- Full API documentation remains discoverable.
- Calls requiring absent permissions return structured `E_PERMISSION` with the exact permission and capability.
- Where Chrome supports runtime permission requests, expose an explicit agent-callable path to request that permission.
- Permission denial remains recoverable and visible to the model.
- Missing platform support returns `E_UNSUPPORTED`, not `undefined` dereferences or unknown internal actions.

Acceptance criteria:

- The agent can discover every supported API.
- Permission-dependent calls never fail with `Cannot read properties of undefined`.
- Errors explain whether the cause is permission, unsupported browser capability, invalid arguments, missing tab, or internal failure.
- No API is hidden as a substitute for correct error handling.

## P1: Preserve Unlimited Execution While Detecting Repeated Evidence

The stress-test run legitimately used 71 tool calls. Browsergent must not impose a hard call limit.

However, the model repeated the same empty-message `SyntaxError` many times. Browsergent should improve evidence quality without taking control away from the agent.

Required behavior:

- Never block or terminate repeated calls automatically.
- Detect repeated equivalent failures and attach structured metadata to the next model context:

```json
{
  "repeatedFailure": {
    "code": "E_JS_RUNTIME",
    "normalizedMessage": "SyntaxError: <no message>",
    "count": 5,
    "firstToolCallId": "...",
    "latestToolCallId": "..."
  }
}
```

- This is advisory evidence, not a policy gate.
- The model remains free to repeat the call when repetition is intentional.

Acceptance criteria:

- No call is rejected due to repetition count.
- Repeated failures are grouped accurately in context and diagnostics.
- A changed input or changed error starts a separate group.

## P1: Make Diagnostics Lossless Without One Store Update Per SSE Delta

The captured export was approximately 18.9 MB with 26,945 diagnostic events. Of those, 26,139 were individual SSE events.

Full fidelity is required. Truncation is not acceptable. The problem is event granularity and repeated persistence work, not data volume.

Current pressure points:

- `src/worker/anthropic-sse.ts`
- `src/worker/anthropic.ts`
- `src/state/slices/diagnostics-slice.ts`
- `src/sidepanel/app.tsx`
- `src/controllers/session-controller.ts`

Required behavior:

- Collect the complete raw SSE transcript in the worker for each provider response.
- Emit one lossless provider-response diagnostic record when the response completes.
- Preserve event order, event names, raw data, timing, and unparsed remainder.
- Do not append one Zustand entry or schedule one session save per token delta.
- Use lossless compression for persisted/exported diagnostics when practical.
- Export must restore or include the complete uncompressed logical data.

Acceptance criteria:

- The same raw SSE data can be reconstructed byte-for-byte or event-for-event.
- A long response causes bounded store updates.
- Chat streaming remains real-time.
- Diagnostic capture does not materially slow tool loops or UI rendering.

## P1: Remove Redundant Diagnostic Copies Without Removing Information

`model_request` and `provider_request.body` duplicate most of the same context. Full information should remain available, but identical payloads should not be copied repeatedly.

Required behavior:

- Store immutable diagnostic payloads once and reference them by ID.
- Preserve both semantic layers:
  - SDK/core model request
  - Exact provider wire request
- Store a full payload when the wire representation differs.
- Do not truncate, summarize, or discard either representation.

Acceptance criteria:

- Export consumers can reconstruct both requests exactly.
- Identical message bodies are not duplicated in session storage.
- References remain valid after session reload and export.

## P1: Add Stable Run, Turn, Model-Call, and Tool-Call Identity

Trace step numbers reset each user turn and do not fully describe ordering across a session.

Every diagnostic and trace record should carry:

- `sessionId`
- `runId`
- `turnIndex`
- `modelCallIndex`
- `toolCallIndex`
- session-global monotonic sequence
- provider tool-call ID where applicable
- core tool-call ID where applicable

Acceptance criteria:

- Every event can be placed in one total session order.
- Tool start and end records pair unambiguously.
- Concurrent or stale run events cannot overwrite another run.
- Export analysis does not rely on timestamps alone.

## P1: Record Full Context Accounting

The observed context growth was acceptable, but Browsergent should make it measurable rather than guess from JSON character counts.

For every model request record:

- exact message count
- exact serialized wire bytes
- provider-reported input tokens
- provider-reported output tokens
- cache-read and cache-write tokens
- system prompt bytes/tokens
- tool-definition bytes/tokens
- tool-result bytes/tokens
- projected versus original message count
- summaries inserted by the core
- configured context window
- remaining context budget

Required behavior:

- Metrics are observational only.
- Do not stop, truncate, or summarize solely because an arbitrary Browsergent threshold was reached.
- Context projection remains owned by the core and must be visible in diagnostics.

## P2: Improve Export Format for Serious Debugging

Conversation exports should be self-describing debugging artifacts.

Add:

- export schema version
- Browsergent version and git revision when available
- pi-host-web version
- extension-js version
- model ID and provider type
- browser and extension versions
- session/run identifiers
- diagnostic payload index
- checksums for referenced payloads
- compression metadata

Do not include:

- API keys
- authorization headers
- session cookies unless an explicit security-sensitive export mode is introduced

Acceptance criteria:

- Export parsers can reject unsupported schema versions cleanly.
- Package versions make runtime behavior reproducible.
- Secrets remain absent even when full diagnostics are enabled.

## Required Verification

Before this document is considered complete:

1. Run TypeScript type checking and all unit tests.
2. Run the production extension build.
3. Run an E2E turn with at least 100 consecutive successful tool calls.
4. Run an E2E turn with repeated recoverable tool failures followed by successful recovery.
5. Confirm there is no hard call-count or turn-step termination.
6. Confirm globalThis and session-scoped WASM state persist across calls and user turns; cell-local bindings do not.
7. Confirm `get_doc` works in the production worker.
9. Export the full conversation and reconstruct all provider requests, SSE responses, model responses, tool calls, and core statuses.
10. Verify the export contains no API key or authorization header.

## Explicit Non-Goals

- Reducing tool calls for cost control.
- Imposing a fixed maximum number of agent steps.
- Hiding powerful APIs to avoid handling permissions correctly.
- Resetting JavaScript state between calls.
- Truncating context, tool output, or debugging evidence.
- Stopping the agent merely because it repeats an action.
- Replacing agent judgment with rigid workflow limits.
