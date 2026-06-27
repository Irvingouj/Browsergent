# TDD Sub-Plan: pi-oxide SDK — environmental steer support

> Pairs with `plan-environmental-skills.md`. Targets `../pi-oxide`. **Zero pi-core changes** — only SDK types, `steerAgent`, the `Agent` facade, and the event surface.

## Goal

Make `Agent.steer()` carry a typed `source`, emit a `steer` event so hosts can route (bubble vs. silent), and keep the turn non-interrupting. Dedup stays in Browsergent (conversation-scoped); the SDK is a dumb pipe — it injects what it's told.

## What already works (verified, do not touch)

- `hostSteer` (pi-core) queues a `User` message; drained on next `continueTurn` between tool/LLM steps (`turn-loop.ts:182-189`). **Turn is never interrupted.**
- `Agent.steer()` (`agent.ts:241-258`) calls `steerAgent()` → `hostAgent.steer({role:"user", content, timestamp})`.
- `steerAgent` (`agent-engine.ts:210-220`) hardcodes `role: "user"` and emits **no event**.

## The gap

1. No way to tag *why* a steer happened (user vs. navigation vs. system).
### 1. `sdk/types.ts` — widen types

```typescript
// New: discriminated union for why a steer/run fired.
export type TriggerSource =
  | { kind: "user" }
  | { kind: "navigation"; url: string; matchedSkills: string[] }
  | { kind: "system"; reason: string };

// Widen AgentInput to carry source (optional — defaults to user).
export type AgentInput =
  | string
  | {
      text: string;
      attachments?: AgentAttachment[];
      metadata?: Record<string, unknown>;
      source?: TriggerSource;   // NEW — undefined === { kind: "user" }
    };

// New event name (appended to AgentEventName union).
export type AgentEventName =
  | "messageStart" | "text" | "messageEnd"
  | "toolStart" | "toolUpdate" | "toolEnd"
  | "artifact" | "status" | "done" | "error" | "debug"
  | "steer";   // NEW

// New event payload.
export interface SteerEvent {
  source: TriggerSource;
  text: string;            // the injected text
  timestamp: number;
}

// Extend AgentEventHandler with the steer branch.
E extends "steer" ? (event: SteerEvent) => void : …
```

### 2. `sdk/agent.ts` — `Agent.steer()` emits the event itself

**Critical:** the WASM `AgentEvent` (`pi_host_web.d.ts:240`) is a closed Rust-side
union with no `steer` variant, and we promised zero core changes. So `steerAgent`
stays a pure injector (no event), and `Agent.steer()` emits the `steer` event on
its own `emitter` — an SDK-only event that never touches the WASM stream or the
`EventMapper`. This keeps the layers clean: WASM owns turn events, SDK owns
steer/source metadata.

```typescript
async steer(input: string | AgentInput): Promise<void> {
  // …existing guards…
  const text = typeof input === "string" ? input : input.text;
  const source: TriggerSource =
    typeof input !== "string" && input.source ? input.source : { kind: "user" };

  await steerAgent(this.engineAgent, input);   // unchanged — pure injection

  this.emitter.emit("steer", { source, text, timestamp: Date.now() });
}
```

`steerAgent` (`agent-engine.ts:210-220`) is **unchanged** — it already injects
the `User` message. No signature change, no fake event.

## What we explicitly do NOT do

- **No dedup in the SDK.** Conversation-scoped "don't re-inject skill X" is a Browsergent concern (it owns session state). SDK dedup would couple it to host semantics.
- **No new `AgentMessage` variant.** Steer stays a `User` message — the core and transcript are unchanged. `source` is host metadata, not core state.
- **No interruption.** Steer continues to queue and drain between steps. Verified.
- **No `source` on `run()`.** Only `steer` needs it — `run()` is the initial user turn; making it carry `source` is speculative (YAGNI). If Browsergent later wants to mark the initial turn's source, the field is already on `AgentInput`.

## TDD order

### Red → Green: unit tests (`test/agent.test.ts` + `test/orchestration.test.ts`)

1. **steer emits a `steer` event with user source by default.**
   - `new Agent`, `agent.run("hi")` with a mock model that returns fast, then `agent.steer("ctx")`.
   - Assert a `steer` event fired with `source: {kind:"user"}` and `text: "ctx"`.
2. **steer carries a navigation source through to the event.**
   - `agent.steer({ text: "<navigation_trigger…/>", source: {kind:"navigation", url, matchedSkills:["s"]} })`.
   - Assert `source.kind === "navigation"` on the emitted event.
3. **steerAgent (engine-level) injects a User message — no event.**
   - Direct `createEngineAgent` + `steerAgent(hostAgent, input)`.
   - Assert it does **not** throw and does **not** emit anything (the event is
     `Agent.steer()`'s job, not `steerAgent`'s). The engine stays a pure injector.
4. **steer before run still throws `agent_not_initialized`.** (existing TM-28 — re-assert it still passes after the signature change.)
5. **type-only: `TriggerSource` and `SteerEvent` are exported from `sdk/index.ts`.** Compile-time assertion via a `typeof` check in a test file.

### Verification: real DeepSeek e2e (`test/steer-e2e.real.test.ts`)

Skipped unless `DEEPSEEK_API_KEY` is set (same gate as Browsergent's `real-deepseek.spec.ts`). Drives a real two-step turn:

- Agent config: `anthropic({ apiKey, baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro[1m]" })`, one tool `echo` that returns its input.
- `agent.run("Call the echo tool with the word 'ready', then stop.")`.
- After the first `toolEnd` event (mid-turn), `agent.steer({ text: "<navigation_trigger url='https://example.com/jobs'><skill>probe-skill</skill></navigation_trigger>", source: {kind:"navigation", url, matchedSkills:["probe-skill"]} })`.
- Assert: turn completes (status `completed`, **not** aborted/broken), and the final assistant text or a later tool call references the injected skill content ("probe-skill").
- **Confidence gate:** this proves (a) steer lands mid-turn, (b) turn isn't broken, (c) the LLM actually sees and uses the injected content.

Run: `cd ../pi-oxide/pi-host-web && DEEPSEEK_API_KEY=$(… ) node --experimental-strip-types --test test/steer-e2e.real.test.ts`.

### Fire-review (95% confidence gate)

Spawn 4 parallel reviewers (correctness, types/API surface, regression-risk on existing steer/run tests, e2e validity) against the diff. Zero blocking findings before bump.

### Release

1. Bump `pi-host-web/package.json` + `pkg/package.json` version (0.9.5 → 0.9.6 — minor, additive).
2. `npm run build:pkg` (builds + packs `pkg/`).
3. Commit on a feature branch, push, open PR. After CI green, merge.
4. `npm publish` the `pkg/` (scoped `@pi-oxide/pi-host-web@0.9.6`). Tag `v0.9.6`.

## Files touched (exhaustive)

| File | Change |
|------|--------|
| `pi-host-web/sdk/types.ts` | `TriggerSource`, widen `AgentInput`, `"steer"` event, `SteerEvent`, handler branch |
| `pi-host-web/sdk/agent.ts` | `Agent.steer()` extracts source, calls `steerAgent`, emits `steer` event on `this.emitter` |
| `pi-host-web/sdk/index.ts` | export `TriggerSource`, `SteerEvent` |
| `pi-host-web/test/agent.test.ts` | steer-event tests (red→green) |
| `pi-host-web/test/orchestration.test.ts` | regression: `steerAgent` still injects, still no event |
| `pi-host-web/test/steer-e2e.real.test.ts` | NEW — real DeepSeek e2e (gated) |

**6 files, ~100 lines net.** No Rust, no core, no transcript format change, `agent-engine.ts` unchanged.

