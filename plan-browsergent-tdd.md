# TDD Sub-Plan: Browsergent — environmental skills (§17 + §19)

> Pairs with `plan-environmental-skills.md`. Consumes `@pi-oxide/pi-host-web@0.9.6` (environmental steer). **Zero pi-oxide changes** — only Browsergent.

## Goal

When the agent navigates to a URL matching a skill's `match` glob mid-turn, the skill's content is steered into the turn (not interrupting it). Each skill steers at most once per session. §17 (per-domain) collapses into §19 (URL-match glob).

## What 0.9.6 gives us

- `Agent.steer(input: string | { text, source?, ... })` — queues in any phase, drains at next continue_turn, never breaks the turn.
- `TriggerSource` type (`{kind:"user"} | {kind:"navigation", url, matchedSkills} | {kind:"system", reason}`).
- `"steer"` event on `AgentEventName` with `SteerEvent { source, text, timestamp }` — SDK-only, lets the host route (silent vs. notice).

Browsergent consumes `agent.steer()` from the worker. The worker owns conversation-scoped dedup (the SDK stays a dumb pipe).

## Architecture (all Browsergent-side)

```
chrome.webNavigation.onCommitted (side panel)
  → UrlTracker.onNavigate(url)        [dedup on same-URL]
  → matchSkillsToUrl(skills, url)     [glob match]
  → if agent running:
      post {type:"skillAutoActivate", skillName, skillBody, url} → worker
      → worker.steerSkill(): if skillName ∉ injectedThisSession → agent.steer(<navigation_trigger>)
  → if agent idle:
      stage in pendingAutoSkills → merge at next agentStart
```

## Changes (minimal, in TDD order)

### 1. `src/skills/url-match.ts` (NEW) + tests — pure, no deps

```typescript
export function matchSkillsToUrl(skills: SkillMeta[], url: string): SkillMeta[] {
  return skills.filter(s => s.match && globMatch(s.match, url));
}
function globMatch(pattern: string, url: string): boolean { /* glob→regex, case-insensitive, full-URL */ }
```

Tests (`unit/url-match.spec.ts`): exact, `*` wildcard, subdomain, path, case-insensitive, no-match, skill without `match` field skipped, multiple matches.

### 2. Frontmatter `match` field

- `parse-skill-md.ts`: add `match?: string` to `SkillFrontmatter` + `coerceFrontmatter`.
- `skill-types.ts`: add `match?: string` to `SkillMeta`.
- `validate-skill-meta.ts`: if `match` present, validate non-empty + glob-safe chars; warn (not block) on overly-broad patterns.
- `format-skill-catalog.ts`: add `<match>` element to catalog XML.
- Tests: extend existing parse/validate/catalog specs.

### 3. `src/sidepanel/url-tracker.ts` (NEW) — URL state

```typescript
class UrlTracker {
  onNavigate(url: string): void;        // dedup on same-URL, emit
  subscribe(fn: (url: string) => void): () => void;
  getCurrentUrl(): string;
}
```
Wired to `chrome.webNavigation.onCommitted` (main frame, filter chrome://) in `app.tsx` / `use-app-init.ts`. On panel open, seed via `chrome.tabs.query({active:true})`.

Tests (`unit/url-tracker.spec.ts`): dedup, emit on change, no emit on same-URL, filter chrome://.

### 4. Message types (`src/types/messages.ts`)

Add to `PanelToWorker`: `{ type: "skillAutoActivate"; skillName: string; skillBody: string; url: string }`.
(Idle-path staging is side-panel-local state, no new message — merged into existing `agentStart.activatedSkills`.)

### 5. Worker `steerSkill` + dedup (`src/worker/agent-loop.ts` + `index.ts`)

```typescript
// AgentLoop gains:
private injectedSkills = new Set<string>();
async steerSkill(skillName: string, skillBody: string, url: string): Promise<void> {
  if (!this.agent || this.aborted) return;
  if (this.injectedSkills.has(skillName)) return;   // conversation-scoped dedup
  this.injectedSkills.add(skillName);
  const text = `<navigation_trigger url="${url}"><skill name="${skillName}">${skillBody}</skill></navigation_trigger>`;
  await this.agent.steer({ text, source: { kind:"navigation", url, matchedSkills:[skillName] } });
}
```
- `injectedSkills` cleared on `reset()` and at the start of each `run()` (per-session = per-run, since Agent is recreated per run).
- `index.ts`: handle `skillAutoActivate` → `agentLoop.steerSkill(...)`.

Tests (`unit/worker-steer-skill.spec.ts` or extend): dedup (same skill steered twice → one call), reset clears set, aborted no-ops.

### 6. Side-panel dispatch (`app.tsx` / `use-app-init.ts`)

- Subscribe to `UrlTracker`.
- On URL change: `matchSkillsToUrl(skills, url)`.
- If agent running: for each match, load skill body via `skillService`, post `skillAutoActivate`.
- If idle: store in `pendingAutoSkills` Set; in `handleRun`, merge into `activatedSkills` before `agentStart`.

### 7. System prompt (`anthropic-prompts.ts`)

Add to SYSTEM_PROMPT:
```
Skills may activate automatically when you navigate to a matching URL.
You'll receive a <navigation_trigger> message with the skill content.
Use the skill's instructions to guide your actions on that page.
Treat it as context, not a new command.
```

## What we explicitly do NOT do

- **No autonomous turn-start from env events.** Idle-match only stages skills; starting a turn still needs user input.
- **No `match: [...]` arrays.** Single glob string.
- **No regex.** Glob only.
- **No new AgentMessage variant.** Navigation trigger is a `User` message with XML content.
- **No SDK-level dedup.** Worker owns it (`injectedSkills` Set per run).

## Verification

- **Unit**: all new pure modules (url-match, url-tracker, steerSkill dedup) + extended parse/validate/catalog specs.
- **Integration/E2E**: extend an existing Playwright spec or `tests/skill-*.spec.ts` — agent on a fixture page, navigate to a URL matching a seeded skill mid-run, assert the skill content appears in the trace/transcript and the turn completes. Gate on real DeepSeek creds like `real-deepseek.spec.ts` if model-dependent.

## Files touched (exhaustive)

| File | Change |
|------|--------|
| `src/skills/url-match.ts` | NEW — matcher + glob |
| `unit/url-match.spec.ts` | NEW — matcher tests |
| `src/skills/skill-types.ts` | `match?: string` on SkillMeta |
| `src/skills/parse-skill-md.ts` | `match?` in frontmatter + coerce |
| `src/skills/validate-skill-meta.ts` | validate `match` |
| `src/skills/format-skill-catalog.ts` | `<match>` in catalog XML |
| `src/sidepanel/url-tracker.ts` | NEW — URL state |
| `unit/url-tracker.spec.ts` | NEW — tracker tests |
| `src/types/messages.ts` | `skillAutoActivate` PanelToWorker |
| `src/worker/agent-loop.ts` | `steerSkill` + `injectedSkills` dedup |
| `src/worker/index.ts` | dispatch `skillAutoActivate` |
| `src/sidepanel/app.tsx` (or `use-app-init.ts`) | UrlTracker wiring + idle/run dispatch |
| `src/worker/anthropic-prompts.ts` | navigation_trigger prompt rule |

~13 files. No pi-oxide changes.
