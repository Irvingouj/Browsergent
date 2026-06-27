# Design: URL-Triggered Skill Auto-Activation

## Goal

When the agent's active tab navigates to a URL matching a skill's `match` pattern, the skill auto-activates — no user action needed. This generalizes Browsergent's trigger model beyond "user typed a message" to include navigation events, and lays groundwork for other non-user trigger sources.

## Current State

### Skill activation (two paths, both user-initiated)
1. **Compose-time**: user types `/skill:name` → `resolveRunTask()` wraps skill body in XML → baked into `resolvedTask` → `agentStart`. One-shot, before run.
2. **Runtime**: LLM calls `load_skill({ skill, path })` tool → relay to side panel → reads OPFS → content returned as tool result. Agent-initiated, not automatic.

### Frontmatter fields
`parse-skill-md.ts` reads: `name`, `description`, `disable-model-invocation`, `arguments`. No `match` field.

### URL tracking
**None.** Worker has no "current URL" state. LLM sees URLs only as text in `run_js` tool output. `chrome.webNavigation` permission is in `manifest.json` but unused.

### Trigger sources
Only one: `AgentMessage::user(text)` via `agent.run(resolvedTask)`. The pi-core `start_turn` accepts any `AgentMessage` (User/Assistant/ToolResult), and `hostSteer` injects mid-run messages — but Browsergent only ever calls these with user-originated text.

## Design

### Part 1: pi-oxide — trigger source awareness

**The core needs no changes.** `AgentMessage::User` is `{ content, timestamp }` — it doesn't know or care if a human typed it or a URL event generated it. `start_turn` and `steer` already accept any `AgentMessage`. The core is trigger-source-agnostic by design.

What's missing is at the **SDK orchestration layer** (`pi-host-web/sdk/`): a concept of *why* a turn or steer was initiated, so the host can:
- distinguish user vs system messages in UI/event streams
- apply different policies (e.g., navigation triggers don't produce a chat message bubble)
- future: rate-limit, debounce, or batch system triggers

#### Change: `TriggerSource` type in SDK

```typescript
// pi-host-web/sdk/types.ts
export type TriggerSource =
  | { kind: "user"; text: string }
  | { kind: "navigation"; url: string; matchedSkills: string[] }
  | { kind: "system"; text: string; source: string };
```

#### Change: `Agent.steer()` accepts trigger source

```typescript
// pi-host-web/sdk/agent.ts
async steer(input: string | AgentInput | TriggerSource): Promise<void>
```

When `TriggerSource` is passed, the SDK:
1. Constructs an `AgentMessage::user(text)` — the core still sees a user message (no core change)
2. Emits a `trigger` event to the event stream so the host UI can react (show a system notice, not a chat bubble)
3. The message content is formatted by the host, not the SDK — the SDK just carries it

This is a **thin addition**: one new type, one event, no core changes. The SDK's `steer()` already calls `steerAgent()` → `hostSteer(handle, message)`. We just widen the input type and emit an event.

**Why not add `source` to `UserMessage` in pi-core?** That changes the serialized transcript format, affects context projection, and every host. The source of a trigger is a host orchestration concern — the core processes messages, it doesn't need to know their origin. If we later want the LLM to see the source (e.g., "this message was from a navigation event"), that's a prompt-content concern, not a type concern — the host can include it in the message text.

### Part 2: Browsergent — frontmatter `match` field

#### Frontmatter

```yaml
---
name: linkedin-jobs
description: Navigate and filter LinkedIn job search results
match: "linkedin.com/jobs/search*"
---
```

#### Match pattern syntax

Glob-style, matched against the full URL:
- `*` matches any sequence (including path separators)
- `?` matches any single character
- literal text matches exactly
- case-insensitive
- matched against the full `window.location.href` (protocol + host + path + query)

Examples:
- `linkedin.com/jobs/search*` → matches `https://www.linkedin.com/jobs/search/?keywords=engineer`
- `*.linkedin.com/jobs/*` → same, explicit subdomain wildcard
- `github.com/*/pull/*` → matches any GitHub PR

#### Parsing changes

**`src/skills/parse-skill-md.ts`**: Add `match?: string` to `SkillFrontmatter`. Single string only — if a skill needs multiple patterns, it's multiple skills or we add `match: [...]` later (YAGNI for now).

**`src/skills/skill-types.ts`**: Add `match?: string` to `SkillMeta`.

**`src/skills/validate-skill-meta.ts`**: If `match` is present, validate it's non-empty and contains only glob-safe characters.

**`src/skills/format-skill-catalog.ts`**: Add `<match>` element to the catalog XML so the LLM knows which skills are URL-triggered:
```xml
<skill>
  <name>linkedin-jobs</name>
  <description>Navigate and filter LinkedIn job search results</description>
  <match>linkedin.com/jobs/search*</match>
  <location>/skills/user/linkedin-jobs/SKILL.md</location>
</skill>
```

### Part 3: Browsergent — URL tracking

#### Where to track

The **side panel** (main thread), not the worker. Reasons:
- `chrome.webNavigation` / `chrome.tabs.onUpdated` are Chrome APIs — main-thread only
- The side panel already bridges worker ↔ Chrome APIs
- The worker is sandboxed; it learns about URLs only through `run_js` results

#### URL source: `chrome.webNavigation.onCommitted`

`manifest.json` already has `webNavigation` permission. Add a listener in the side panel:

```typescript
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;  // main frame only
  if (details.url.startsWith("chrome://") || details.url.startsWith("chrome-extension://")) return;
  urlTracker.onNavigate(details.url, details.tabId);
});
```

This fires on every top-level navigation — user clicks, `page.goto`, redirects. More reliable than parsing `run_js` output, which only fires when the LLM explicitly calls `page.url` or `page.snapshot`.

#### URL state

```typescript
// src/sidepanel/url-tracker.ts
interface UrlState {
  currentUrl: string;
  currentTabId: number | null;
  previousUrl: string | null;
}

type UrlListener = (state: UrlState) => void;

class UrlTracker {
  private state: UrlState = { currentUrl: "", currentTabId: null, previousUrl: null };
  private listeners = new Set<UrlListener>();

  onNavigate(url: string, tabId: number): void {
    if (url === this.state.currentUrl) return;  // no-op on same-URL
    this.state = {
      currentUrl: url,
      currentTabId: tabId,
      previousUrl: this.state.currentUrl,
    };
    this.emit();
  }

  subscribe(listener: UrlListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  getState(): UrlState { return this.state; }
}
```

#### Forwarding URL to worker

When URL changes, side panel posts to worker:

```typescript
// New PanelToWorker message
| { type: "urlChanged"; url: string; tabId: number }
```

Worker stores this in a module-level variable (same pattern as `currentRunId`, `currentSessionId`).

### Part 4: Browsergent — match dispatch

#### The matcher

```typescript
// src/skills/url-match.ts
export function matchSkillsToUrl(
  skills: SkillMeta[],
  url: string,
): SkillMeta[] {
  return skills.filter(s => s.match && globMatch(s.match, url));
}

function globMatch(pattern: string, url: string): boolean {
  // Convert glob to RegExp: * → .*, ? → ., escape everything else
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(url);
}
```

#### Dispatch logic (side panel)

When `UrlTracker` emits a new URL:

1. **Load all skills** via `SkillRegistry.listSkills()` (cached — only re-scan on import/delete)
2. **Match** via `matchSkillsToUrl(skills, url)`
3. For each matched skill:
   - **Load the skill body** via `skillService.loadSkill(name)`
   - **If agent is running**: post `urlChanged` + matched skill info to worker → worker calls `agentLoop.steerSkill(skillName, skillBody, url)`
   - **If agent is idle**: add to a `pendingAutoSkills` set → when next `agentStart` fires, these are merged into `activatedSkills`

#### Steer path (worker)

```typescript
// src/worker/agent-loop.ts — new method
async steerSkill(skillName: string, skillBody: string, url: string): Promise<void> {
  if (!this.agent || this.aborted) return;
  const steerText = [
    `<navigation_trigger url="${url}">`,
    `<skill name="${skillName}">`,
    skillBody,
    `</skill>`,
    `</navigation_trigger>`,
  ].join("\n");
  await this.agent.steer(steerText);
}
```

The LLM receives this as a steering message mid-run. It sees the skill content and the URL context. The XML tags distinguish it from user chat — the system prompt already uses `<skill>` and `<available_skills>` tags, so this is consistent.

#### Idle path (side panel)

```typescript
// src/sidepanel/app.tsx — in handleRun, before resolveRunTask
const autoSkills = urlTracker.getState().currentUrl
  ? matchSkillsToUrl(allSkills, urlTracker.getState().currentUrl).map(s => s.name)
  : [];
// merge autoSkills into the activatedSkills from resolveRunTask
```

### Part 5: Message types

New `PanelToWorker`:
```typescript
| { type: "urlChanged"; url: string; tabId: number }
| { type: "skillAutoActivate"; skillName: string; skillBody: string; url: string }
```

New `WorkerToPanel` (optional, for UI feedback):
```typescript
| { type: "skillAutoActivated"; runId: string; skillName: string; url: string }
```

### Part 6: System prompt awareness

The system prompt (`anthropic-prompts.ts`) should mention that skills can auto-activate on navigation, so the LLM understands the `<navigation_trigger>` XML when it arrives via steer:

```
Skills may activate automatically when you navigate to a matching URL.
You'll receive a <navigation_trigger> message with the skill content.
Use the skill's instructions to guide your actions on that page.
```

## Trigger flow diagrams

### Running agent navigates to matching URL

```
chrome.webNavigation.onCommitted
  → UrlTracker.onNavigate(url, tabId)
  → matchSkillsToUrl(skills, url) → [linkedin-jobs]
  → skillService.loadSkill("linkedin-jobs") → skillBody
  → postMessage({ type: "skillAutoActivate", skillName, skillBody, url })
  → worker: agentLoop.steerSkill(name, body, url)
  → agent.steer("<navigation_trigger>...</navigation_trigger>")
  → LLM receives steering message, uses skill content
```

### Idle agent — URL changes, then user starts a run

```
chrome.webNavigation.onCommitted
  → UrlTracker.onNavigate(url, tabId)
  → matchSkillsToUrl(skills, url) → [linkedin-jobs]
  → pendingAutoSkills.add("linkedin-jobs")

[user types task, clicks run]
  → handleRun()
  → resolveRunTask(task) → { activatedSkills: [...] }
  → merge pendingAutoSkills into activatedSkills
  → postMessage({ type: "agentStart", activatedSkills: [...], ... })
  → skill body baked into system prompt
```

## Edge cases

1. **Multiple skills match same URL**: All matched skills are activated. Order by skill name for determinism. If catalog budget (8000 chars) is exceeded, truncate — same as today.

2. **Skill matches on every page** (e.g., `match: "*"`): This is valid but noisy. The `match` field is opt-in; if a skill author writes `*`, that's their choice. We could add a warning in `validate-skill-meta.ts` but not block it.

3. **URL changes rapidly** (redirects): `UrlTracker` deduplicates on same-URL. For rapid A→B→A, each transition fires. The steer path is async; if a new steer arrives while the previous is in-flight, the SDK queues it (existing `hostSteer` behavior — steering messages are queued and drained on `continueTurn`).

4. **Agent is stopped**: `steerSkill` checks `this.aborted` and returns early. No-op.

5. **Side panel closed**: `webNavigation` listener is in the side panel script. If the panel is closed, no listener fires. When the panel reopens, `UrlTracker` initializes with the current tab URL (via `chrome.tabs.query`) and fires one initial match check.

6. **`page.goto` to chrome:// URLs**: Rejected by existing `page_goto` handler. `webNavigation.onCommitted` listener also filters these. Consistent with the testing invariant.

7. **Match pattern invalid**: `validate-skill-meta.ts` catches it on import. Skill loads but `match` is ignored with a warning.

## What's NOT in this design

- **No pi-core changes.** The core is already trigger-source-agnostic.
- **No new AgentMessage variant.** Navigation triggers use `User` messages with XML-wrapped content. The LLM distinguishes them by content, not type.
- **No automatic agent start.** URL match alone doesn't start a new turn when idle — it only pre-loads skills. Starting a turn requires user action (avoids surprise agent runs).
- **No match pattern arrays.** Single string per skill. Add `[...]` support later if needed.
- **No regex match patterns.** Glob only. Simpler, safer, sufficient for URL matching.

## Implementation order

1. `url-match.ts` + tests — pure function, no dependencies
2. Frontmatter `match` field in `parse-skill-md.ts` + `skill-types.ts` + `validate-skill-meta.ts`
3. Catalog XML `<match>` element in `format-skill-catalog.ts`
4. `UrlTracker` + `webNavigation` listener in side panel
5. `urlChanged` + `skillAutoActivate` message types
6. Worker: `steerSkill` method on `AgentLoop`
7. Side panel: wire `UrlTracker` → match → post to worker
8. System prompt: add navigation trigger awareness
9. `TriggerSource` type in pi-host-web SDK (optional — can ship without it, using plain `steer()`)