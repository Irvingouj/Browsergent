# Browsergent Robustness Plan

Goal: make Browsergent recover predictably when browser tools fail, the JS runtime is corrupted, or the LLM provider/network is weak.

This plan intentionally ignores cosmetic issues and broad product architecture. It focuses on runtime survival, correct failure semantics, retry behavior, and tests that prove recovery.

## Success Criteria

Browsergent is robust when all of these are true:

1. A failed tool call is preserved as a failed tool result in model history, trace, and UI state.
2. The agent can continue after recoverable tool failures without hallucinating success.
3. A corrupted or timed-out JS runtime is stopped, rebuilt, health-checked, and then reused.
4. A timed-out JS execution cannot produce late browser side effects after Browsergent marks it failed.
5. Provider network failures are classified, retried when safe, and surfaced clearly when exhausted.
6. Streaming provider corruption never becomes a fake successful response.
7. Stop/reset cancels provider requests, pending tool relays, and runtime executions.
8. E2E tests cover the real browser-agent loop for these failure modes.

## Phase 1: Preserve Tool Failure Semantics

Problem:

- `src/worker/anthropic-model.ts` currently converts SDK `tool_result` messages with `is_error: false`.
- This can make the model believe a failed browser action succeeded.

Implementation:

1. Audit the `@pi-oxide/pi-host-web` `AgentMessage` shape for tool result error fields.
2. Update `sdkToWasmMessages()` in `src/worker/anthropic-model.ts` to preserve tool error state.
3. Normalize tool outputs into a structured shape:

```ts
type ToolExecutionResult =
  | { ok: true; output: string }
  | { ok: false; code: string; message: string; retryable: boolean };
```

4. Make `createAgentTools()` return a failed tool result when `runJs()` rejects, rather than throwing an unclassified error through the SDK.
5. Ensure trace entries show `status: "error"` with the same code/message the model receives.

Files:

- `src/worker/anthropic-model.ts`
- `src/worker/agent-tools.ts`
- `src/worker/agent-loop.ts`
- `src/types/messages.ts`

Tests:

- Unit: failed tool result remains `is_error: true` in provider message conversion.
- Unit: `run_js`/runtime rejection becomes structured failed tool output.
- E2E: stale ref/tool failure is shown in trace and the model gets a chance to retry with a fresh snapshot.

Done when:

- Tool failure cannot be represented as success accidentally.

## Phase 2: Runtime Supervisor for JS Execution

Problem:

- `ExtensionLuaClient` uses `Promise.race()` for timeout.
- The losing `runCellAsync()` may keep executing after Browsergent marks it failed.
- Runtime rebuild exists, but there is no health check or generation guard.

Implementation:

1. Introduce a runtime generation ID in `ExtensionLuaClient`.
2. Every execution captures the current generation.
3. On timeout/crash:
   - mark generation dead,
   - abort/stop the current session,
   - reject all queued work for that generation,
   - rebuild the session,
   - run a health check cell.
4. Ignore or reject any late result from an old generation.
5. Add `cancelCurrentExecution(reason)` and call it from stop/reset.
6. Replace bare `Promise.race()` semantics with a cancellation-aware execution wrapper.
7. Make runtime status visible in store: `ready`, `initializing`, `rebuilding`, `failed`.

Files:

- `src/sidepanel/extension-js-client.ts`
- `src/controllers/extjs-controller.ts`
- `src/controllers/worker-bridge.ts`
- `src/state/slices/extjs-slice.ts`

Runtime health check:

```ts
await session.runCellAsync("1 + 1");
```

Tests:

- Unit: timeout marks old generation dead.
- Unit: late result from old generation is ignored.
- Unit: queued executions fail fast while rebuilding.
- E2E: tool execution timeout is followed by successful runtime rebuild and a later successful tool call.

Done when:

- A corrupted runtime can be rebuilt without late actions leaking into the browser.

## Phase 3: Relay Reliability and Backpressure

Problem:

- Worker-to-panel tool relay has a timeout, but no explicit queue state, cancellation ID, or retry policy.
- Runtime init is asynchronous and can race with worker startup.

Implementation:

1. Await runtime initialization before accepting agent runs.
2. Keep relay state explicit:

```ts
type RelayState =
  | { status: "pending"; id: string; startedAt: number }
  | { status: "completed"; id: string }
  | { status: "failed"; id: string; code: string; message: string }
  | { status: "cancelled"; id: string; reason: string };
```

3. Add relay cancellation messages:
   - worker -> panel: `luaCancelRequest`
   - panel -> worker: `luaCancelResult`
4. On agent stop/reset:
   - reject pending worker promises,
   - cancel panel execution,
   - clear queued runtime work.
5. If runtime is not ready, tool request should fail fast with `E_RUNTIME_NOT_READY`, not wait for relay timeout.

Files:

- `src/worker/index.ts`
- `src/controllers/worker-bridge.ts`
- `src/sidepanel/extension-js-client.ts`
- `src/types/messages.ts`
- `src/protocol/worker-guards.ts`

Tests:

- Unit: stop rejects pending relay and sends cancel.
- Unit: runtime-not-ready returns immediate structured failure.
- E2E: start immediately after opening side panel does not lose tool response.

Done when:

- Tool relay never silently drops a response and stop/reset clears all active work.

## Phase 4: Provider Network Recovery

Problem:

- Provider failures are raw errors.
- There is no retry/backoff for transient failures.
- Streaming interruptions and malformed SSE can degrade into fake success.

Implementation:

1. Add provider error classification:

```ts
type ProviderErrorCode =
  | "E_PROVIDER_AUTH"
  | "E_PROVIDER_RATE_LIMIT"
  | "E_PROVIDER_TIMEOUT"
  | "E_PROVIDER_NETWORK"
  | "E_PROVIDER_OVERLOADED"
  | "E_PROVIDER_BAD_REQUEST"
  | "E_PROVIDER_BAD_STREAM"
  | "E_PROVIDER_UNKNOWN";
```

2. Add a fetch timeout wrapper using `AbortController`.
3. Retry only safe transient cases:
   - network errors,
   - timeout,
   - 429,
   - 500,
   - 502,
   - 503,
   - 504.
4. Use exponential backoff with jitter:
   - attempt 1 immediately,
   - attempt 2 after about 500ms,
   - attempt 3 after about 1500ms,
   - cap total provider wait time.
5. Never retry:
   - 400,
   - 401,
   - 403,
   - invalid model,
   - user abort.
6. Treat malformed SSE as `E_PROVIDER_BAD_STREAM`.
7. Treat invalid tool JSON as a provider/model error, not `{}`.
8. If stream fails after partial assistant text:
   - finalize partial text,
   - mark run error,
   - do not execute partial tool calls.

Files:

- `src/worker/anthropic.ts`
- `src/worker/anthropic-model.ts`
- `src/worker/agent-loop.ts`
- `src/errors/browsergent-error.ts`

Tests:

- Unit: classify 401, 429, 500, timeout, network reset.
- Unit: retry policy retries only retryable errors.
- Unit: malformed SSE fails with `E_PROVIDER_BAD_STREAM`.
- Unit: invalid tool JSON does not become empty args.
- E2E: mock provider fails twice with 503 then succeeds; agent completes.
- E2E: mock provider stream cuts mid-tool-call; no tool is executed and UI shows error.

Done when:

- Weak network/provider outages either recover automatically or fail with a precise non-fake error.

## Phase 5: Agent-Level Recovery Policy

Problem:

- Recovery behavior is spread across provider, runtime, relay, and SDK event handlers.
- The agent needs a small policy layer that decides retry vs fail vs ask model to recover.

Implementation:

1. Introduce a central recovery policy:

```ts
type RecoveryDecision =
  | { action: "retry_same"; delayMs: number }
  | { action: "retry_after_observe" }
  | { action: "rebuild_runtime_then_retry" }
  | { action: "fail"; code: string; message: string };
```

2. Apply policy to:
   - tool timeout,
   - stale ref,
   - not found,
   - runtime corrupted,
   - provider transient error.
3. Keep retry budgets:
   - max 2 retries for same tool call,
   - max 1 runtime rebuild per tool call,
   - max 3 provider attempts per model call,
   - max total run recovery budget.
4. Emit recovery trace entries so the UI shows what happened.

Files:

- `src/worker/agent-loop.ts`
- `src/worker/agent-tools.ts`
- new `src/worker/recovery-policy.ts`
- `src/types/messages.ts`

Tests:

- Unit: stale ref -> retry after observe.
- Unit: runtime corrupted -> rebuild runtime then retry.
- Unit: auth provider error -> fail immediately.
- Unit: transient provider error -> retry same request.

Done when:

- Recovery is explicit, limited, and testable instead of accidental.

## Phase 6: Worker Crash Recovery

Problem:

- Worker crash currently appends a system message and terminates the worker.
- Current run may remain stuck.

Implementation:

1. On worker `error` or unexpected exit:
   - mark agent status `error`,
   - finalize streaming messages,
   - clear active run,
   - reject pending UI/runtime work.
2. Add a `restart()` method on `WorkerBridge`.
3. Allow a new run to start with a fresh worker after crash.
4. Add a startup handshake timeout. If `workerReady` is not received, fail startup.

Files:

- `src/controllers/worker-bridge.ts`
- `src/state/slices/agent-slice.ts`
- `src/sidepanel/app.tsx`

Tests:

- Unit: worker error marks agent failed.
- Unit: worker startup timeout marks agent failed.
- E2E: simulated worker crash does not leave input disabled.

Done when:

- Worker failure cannot wedge the UI.

## Phase 7: End-to-End Failure Matrix

Add an E2E test suite dedicated to recovery:

1. Tool stale ref:
   - first click fails,
   - agent refreshes snapshot,
   - second click succeeds.
2. Tool timeout:
   - runtime execution hangs,
   - timeout fires,
   - runtime rebuilds,
   - next tool call succeeds.
3. Runtime corrupted:
   - injected runtime throws internal error,
   - session rebuilds,
   - health check passes,
   - agent continues.
4. Provider weak network:
   - first request network reset,
   - second request 503,
   - third request succeeds.
5. Provider bad stream:
   - stream cuts during tool JSON,
   - no browser action executes,
   - UI shows provider bad stream error.
6. Stop during tool:
   - long tool execution starts,
   - user stops,
   - no late action happens.
7. Stop during provider stream:
   - partial text arrives,
   - user stops,
   - no further provider/tool events mutate state.

Files:

- `tests/recovery-tool-failure.spec.ts`
- `tests/recovery-runtime.spec.ts`
- `tests/recovery-provider.spec.ts`
- `tests/recovery-stop.spec.ts`
- `tests/helpers.ts`

Done when:

- These tests are green in a fresh extension build.

## Implementation Order

1. Phase 1: preserve tool failure semantics.
2. Phase 3: fix relay init/cancellation reliability.
3. Phase 2: add runtime supervisor and generation guard.
4. Phase 4: provider classification and retry.
5. Phase 6: worker crash recovery.
6. Phase 5: central recovery policy.
7. Phase 7: full E2E matrix.

Reasoning:

- Tool failure semantics must be correct before retry policy is meaningful.
- Relay must be reliable before runtime recovery can be trusted.
- Runtime rebuild must be deterministic before agent-level retry can use it.
- Provider retry can be built independently after the error model is structured.

## Non-Goals

- Redesigning the UI.
- Reworking session persistence.
- Changing extension permissions.
- Resolving Lua vs JS product architecture, except where required for runtime recovery naming.
- Adding multi-provider support.

## Final Definition of Done

The project can claim robust recovery only when:

```bash
npm run typecheck
npm run test:unit
npm run test
```

all pass, and the recovery E2E suite proves:

- tool failure recovery,
- runtime rebuild recovery,
- provider retry recovery,
- bad stream hard failure,
- stop/reset cancellation,
- no stale late side effects.
