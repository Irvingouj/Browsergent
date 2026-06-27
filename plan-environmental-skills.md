# Plan: Environmental Skills (§17 + §19 collapsed) — steer, don't interrupt

> **One-line model change:** the agent's input is the *environment*; the user is one source within it. Navigation events become first-class triggers delivered as **steers** — non-interrupting, deduped, mid-turn.

## Why this exists

Today every agent input is a user utterance. `Agent.run(task)` is the sole entry; the worker never calls `steer`. Skills activate only via `/skill:` (compose-time, baked into the prompt) or `load_skill` (runtime tool, costs a round-trip).

We want: agent navigates to `linkedin.com/jobs/search*` mid-task → the matching skill's content arrives as a **steer** → the agent uses it → turn continues uninterrupted. Same skill never re-injected in the same conversation. §17 (per-domain) collapses into §19 (URL-match) because `domains` is just a narrower `match` glob.

## The non-negotiable invariant

**Steer must not break the turn.** Verified against `turn-loop.ts`: `hostSteer` queues a `User` message; the core drains it on the next `continueTurn` (between tool/LLM steps, turn-loop.ts:182-189). The host never interrupts an in-flight LLM stream. This is already true in pi-core. Our job is to surface it at the SDK layer with typing + events + dedup, then consume it in Browsergent.

## Architecture (two phases, two repos)

```
┌─ pi-oxide (Phase 1) ──────────────────────────────────────────┐
│  SDK widens: AgentInput carries source; steer emits events;   │
│  dedup key prevents same-content re-injection.                │
│  Core: ZERO changes (hostSteer already queues User msgs).      │
└────────────────────────────────────────────────────────────────┘
                          │ npm release @pi-oxide/pi-host-web
                          ▼
┌─ Browsergent (Phase 2) ───────────────────────────────────────┐
│  SkillMeta.match (glob) → url-match.ts → UrlTracker            │
│  (webNavigation) → worker.steerSkill(skill, url)               │
│  → agent.steer(<navigation_trigger>…</navigation_trigger>)     │
│  Conversation-scoped dedup: each (skillName) injected once.    │
└────────────────────────────────────────────────────────────────┘
```

## Phase 1 — pi-oxide + SDK (see `plan-pi-oxide-tdd.md`)

**Scope:** `TriggerSource` type, `Agent.steer()` accepts it and emits a `steer` event, idempotency at the Browsergent layer (not SDK — SDK stays dumb pipe).

**Exit criteria:** real DeepSeek e2e proves a mid-turn steer lands in the transcript and the LLM acknowledges it; fire-reviewers pass; version bumped, pkg built, pushed, released.

## Phase 2 — Browsergent (sub-plan written after Phase 1 lands)

1. `SkillMeta.match: string` (glob) — parse, validate, catalog XML `<match>`.
2. `url-match.ts` — pure `matchSkillsToUrl(skills, url)`, unit-tested first.
3. `UrlTracker` in side panel — `chrome.webNavigation.onCommitted` (permission already in manifest), dedup on same-URL, seed on panel open via `chrome.tabs.query`.
4. Worker `steerSkill(skillName, skillBody, url)` — wraps in `<navigation_trigger url="…"><skill>…</skill></navigation_trigger>`, calls `agent.steer()`.
5. **Conversation-scoped dedup** — worker keeps `Set<skillName>` per sessionId; `steerSkill` is a no-op if already injected. Cleared on `agentReset`.
6. Side-panel dispatch — URL change while running → match → `skillAutoActivate` msg → worker `steerSkill`. While idle → stage in `pendingAutoSkills` → merge into `activatedSkills` at next `agentStart`.
7. System prompt — teach the LLM the `<navigation_trigger>` tag semantics (context, not command).

## End-user experience

- Imports a skill with `match: "linkedin.com/jobs/search*"`. Nothing else.
- On LinkedIn jobs search, types "filter to remote senior roles." Skill is **already active** (URL matched) — agent knows page conventions without `/skill:`.
- Agent clicks a listing → navigates to a detail URL that also matches → mid-run it receives fresh skill content as a steer → adapts, no user action.
- Cross-domain: skills track the active tab. Drag agent across tabs, active skill set follows.
- Silent by default: running-match = trace entry only; idle-match = faint chip "X ready." Never interrupts.

## End-agent experience

- **Turn start:** system prompt's `<available_skills>` includes URL-matched skills (same shape as `/skill:` ones). Agent can't tell why a skill is active.
- **Mid-turn:** receives `<navigation_trigger url="…"><skill>…</skill></navigation_trigger>` as a `User` message (core sees no difference). System prompt rule: treat as context, not a new command.
- **Gains:** contextual skill delivery — right know-how arrives because of *where* the agent is, not *what was asked*. No `load_skill` round-trip tax.
- **Must not:** treat navigation trigger as a new task; start a turn autonomously from an env event (idle → only stage, never execute).

## The canonical flow (the user's example)

```
user: help me apply 10 rust jobs
agent: ok, on it
agent: get_doc{}
agent: run_js {go to https://linkedin.com/search/...}
[webNavigation fires → UrlTracker → matchSkillsToUrl → worker.steerSkill]
agent ← steer: <navigation_trigger url="..."><skill>linkedin-jobs…</skill></navigation_trigger>
agent: Oh, that's useful
agent: run_js {skill-inspired js}
agent: run_js {...}
agent: run_js {...}
```

The steer lands between tool steps (core drains it on `continueTurn`). The turn is never broken. If the agent re-navigates to a matching URL later in the *same* conversation, `steerSkill` is a no-op (dedup).

## Explicitly out of scope

- No pi-core changes (verified — `hostSteer` + `continueTurn` already do this).
- No autonomous turn-start from env events (idle only stages).
- No `match: [...]` arrays (single glob string; YAGNI).
- No regex match (glob only).
- No new `AgentMessage` variant (steer stays a `User` message; XML content distinguishes).
- No SDK-level dedup (Browsergent owns conversation-scoped dedup; SDK is a dumb pipe).
