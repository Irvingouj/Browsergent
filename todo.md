# Browsergent TODO

## Priority (suggested order)

1. **Agent Skills system (§6)** — **both layers mandatory** (compose-time UI + runtime agent)
2. Files panel (§2) + `@` mentions (§3)

§4 is folded into §6 Layer 1 (not a separate optional track).

---

## 1. JS code block UI

**Problem:** Agent `run_js` trace entries render code poorly today.

- `TraceEntryCompact` (`src/sidepanel/components/TraceEntryCompact.tsx`) shows `toolInput` as a plain string.
- Agent `run_js` stores input as truncated JSON (`{"code":"..."}`) from `agent-loop.ts`, so the UI shows escaped JSON instead of readable JS.
- Collapsed preview is `toolInput.slice(0, 60)` — useless for code.
- Running state uses a pulsing `…` badge (`animate-pulse-glow`), not a clear “executing” indicator.

**Goal:** JS runs should look like code blocks, with an obvious in-flight state.

### UI behavior

- [x] **Extract code** from trace input:
  - `toolName === "run_js"` → parse JSON, read `code` string.
  - Fallback: show raw `toolInput` if parse fails.
- [x] **Code block rendering** (replace plain `<div>` text):
  - Monospace block with padding, border, dark surface (`bg-bg-surface`).
  - `white-space: pre-wrap` + `overflow-x: auto` for long lines.
  - Optional: light syntax highlighting — keep dependency-free if possible.
- [x] **Running indicator** when `entry.status === "running"`:
  - Small **spinner** next to the tool name (CSS `@keyframes spin`).
  - Keep existing success ✓ / error ✗ badges for terminal states.
- [x] **Collapsed header** for `run_js`:
  - Preview first meaningful line of code (skip leading comments/blanks), not JSON.
- [x] **Result section:** `font-mono` for console output.

### Files likely touched

- `src/sidepanel/components/TraceEntryCompact.tsx`
- `src/sidepanel/styles.css`
- Optional: `src/sidepanel/components/parse-trace-code.ts`

### Acceptance criteria

1. Expanding a `run_js` step shows formatted JS, not `{"code":...}` JSON.
2. While JS is executing, user sees a spinner beside the step without expanding.
3. No regression for non-JS tools (`get_doc`, etc.).

---

## 2. Remove JS tab → Files panel (tree + preview + upload)

**Problem:** The **JS** tab (`JsPlaybookPanel`, header toggle in `app.tsx`) is unused. Secondary manual JS runner duplicates what the agent already does via `run_js`.

**Goal:** Replace the JS tab with a **Files** side-panel view: file tree, preview pane, upload.

### Remove

- [ ] Header **JS** tab button and `activeTab === "js"` branch in `app.tsx`.
- [ ] `JsPlaybookPanel.tsx` (or repurpose file into Files panel).
- [ ] `UiTab` `"js"`, `jsCodeDraft`, `setJsCodeDraft`, `selectJsCodeDraft` from `ui-slice.ts` / selectors.
- [ ] Playbook-only UX: standalone Run/Stop in playbook (agent `run_js` relay via `ExtensionJsClient` **stays**).
- [ ] `tests/js-playbook-fill-form.spec.ts` — delete or rewrite as files-panel test if needed.
- [ ] Worker messages used only by playbook UI (`extjsRun` from panel, not agent relay) — audit `worker/index.ts` and remove dead paths.

### Add — Files panel

- [ ] New tab: **Files** (or icon-only) replacing JS in header toggle.
- [ ] **File tree** (left or top): folders + files, expand/collapse.
- [ ] **Preview** (right or bottom): text/markdown for `.md`, `.txt`, `.json`, etc.; binary shows name + size only.
- [ ] **Upload**: button + drag-and-drop onto tree; multi-file supported.
- [ ] **Storage** (pick one, document in code):
  - Session-scoped virtual FS in IndexedDB, and/or
  - `extension-js` `fs.*` if suitable for extension context, and/or
  - `chrome.storage` for small metadata + blob store for content.
- [ ] Persist file list per session (save/load with `session-controller`).

### Layout sketch

```text
┌─────────────────────────────────────┐
│ Chat │ Files          [⋯]          │
├─────────────────────────────────────┤
│  tree/          │  preview          │
│  ├─ notes.md    │  # Hello          │
│  └─ data.json   │  ...              │
│  [+ Upload]     │                   │
└─────────────────────────────────────┘
```

### Files likely touched

- `src/sidepanel/app.tsx` — tab switch, remove `JsPlaybookPanel`
- `src/sidepanel/components/FilesPanel.tsx` (new)
- `src/state/slices/ui-slice.ts` — `UiTab: "chat" | "files"`
- `src/state/slices/files-slice.ts` (new) — tree nodes, selected file, blob refs
- `src/controllers/session-controller.ts` — optional files payload in session snapshot

### Acceptance criteria

1. No JS tab in UI; no regression to agent chat or `run_js`.
2. User can upload a file, see it in the tree, and preview its contents.
3. Files survive session switch if session persistence is enabled for that session.

---

## 3. `@` command — reference files in the task input

**Problem:** User cannot attach context from the Files panel when typing a task.

**Goal:** Typing `@` in the task input opens a picker; selecting a file inserts a stable reference the agent can use.

### UI behavior

- [ ] On `@` in `InputBar`, show anchored **file picker** (fuzzy filter as user continues typing).
- [ ] Picker lists files from the current session’s file tree (§2).
- [ ] On select, insert a token into the draft, e.g. `@notes.md` or `@[file:abc123:notes.md]` (exact format TBD — must be parseable and unambiguous).
- [ ] Keyboard: ↑↓ navigate, Enter select, Esc dismiss.
- [ ] Render tokens as chips or highlighted spans in the input (or keep plain text with distinct syntax).

### Agent / prompt plumbing

- [ ] On **Run**, resolve `@` references to file contents (or summaries for large files).
- [ ] Inject into the user message or a structured attachment block the worker sends to the model (keep typed boundaries — no raw string soup).
- [ ] Cap size / truncate with explicit “[truncated]” marker; surface in trace.
- [ ] Agent prompt: explain that `@filename` means “user attached this file; use its contents as context.”

### Files likely touched

- `src/sidepanel/components/InputBar.tsx` — `@` detection, picker UI
- `src/sidepanel/components/FileMentionPicker.tsx` (new)
- `src/sidepanel/resolve-file-mentions.ts` (new) — parse draft → attachments
- `src/worker/agent-loop.ts` or message assembly — attach resolved content
- `src/worker/js-tool-prompt.ts` — document `@` semantics for the model

### Acceptance criteria

1. Type `@` → see files → pick one → token appears in input.
2. Run task with `@notes.md` → model receives file content (visible in diagnostics/export).
3. Broken reference (`@missing.txt`) → clear error before or at run start, not silent failure.

---

## 4. (merged into §6 Layer 1)

`/ command palette` is **not** a separate feature. See **§6 → Layer 1 — Compose-time (mandatory)**.

---

## 5. Refocus input bar when agent becomes idle

**Problem:** After a run finishes (`done`, `stopped`, `error`, or `idle`), focus often stays on the page, trace, or stop button.

**Goal:** When the agent leaves a running state, focus returns to the task input.

### UI behavior

- [x] Watch transition: `loading` / `running` / `waiting_for_model` / `executing_tool` → terminal (`idle`, `done`, `stopped`, `error`).
- [x] On transition, `inputRef.focus()` in `InputBar`.
- [x] Do not steal focus if settings/session panel is open or focus is intentionally inside another side-panel control.

### Files likely touched

- `src/sidepanel/components/InputBar.tsx`
- `data-testid="task-input"` for E2E

### Acceptance criteria

1. Run completes → task input focused without clicking.
2. Mid-run → input not repeatedly refocused.
3. Stop → input enabled and focused.

---

## 6. Agent Skills system (highest priority)

**Research summary (2026):** [Agent Skills](https://cursor.com/docs/skills) is an **open standard** ([agentskills.io](https://agentskills.io/specification)) adopted by Cursor, Claude Code, Codex, VS Code Copilot, and others. One format, many hosts.

### Mandatory: two layers (both required)

Skills are **not** one feature. Browsergent must implement **two distinct layers**, like Cursor does when you type `/create-skill` vs when the agent runs:

```text
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Compose-time (user typing, agent NOT running)          │
│   SkillRegistry metadata · `/` palette · fuzzy match             │
│   Agent sees: nothing until user hits Run                        │
│   Cursor analogue: `/` picker + skill name/description index       │
└──────────────────────────────────────────────────────────────────┘
                              │ Run (+ optional activated skills[])
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2 — Runtime (agent loop active) — TWO mechanisms, BOTH req │
│                                                                  │
│  2a. Activation inject — user picked `/skill` at compose time    │
│      → skill body prepended to user task (or first user message)  │
│      Cursor analogue: manually_attached_skills inlined in request│
│                                                                  │
│  2b. get_skill tool — agent calls during the run                 │
│      → tool_result returns SKILL.md body or references/* path    │
│      Cursor analogue: progressive load / agent pulls skill text  │
└──────────────────────────────────────────────────────────────────┘
```

| Layer | When | Who consumes | Mandatory? |
|-------|------|--------------|------------|
| **1 — Compose** | User types `/cre…` in InputBar | Side panel UI only | **Yes** |
| **2a — Inject** | User clicks Run with activated skill(s) | Model (in user task) | **Yes** |
| **2b — `get_skill`** | Agent tool call mid-run | Model (in `tool_result`) | **Yes** |

Do **not** ship skills with only Layer 1 (palette that does nothing on Run) or only Layer 2b (tool with no `/` UX). Do **not** conflate them: typing `/` is not a tool call.

**Shared foundation:** `SkillRegistry` (parse `SKILL.md`, validate frontmatter, `listSkills()`, `loadSkillBody()`, `loadSkillResource()`).

---

### Layer 1 — Compose-time (mandatory)

**Problem:** User cannot discover or invoke skills while drafting a task.

**Goal:** `/` in the task input opens a palette backed by `SkillRegistry` metadata only (`name`, `description`). No worker, no model call.

- [ ] `SkillRegistry` at sidepanel init: scan `dist/skills/**/SKILL.md` (bundled) + later user skills (§6 Phase D).
- [ ] `listSkills(): SkillMeta[]` — `name`, `description`, `disableModelInvocation`, paths for UI badges.
- [ ] **`/` palette** (`SlashCommandPicker`): fuzzy filter on name/description; share picker primitive with `@` (§3).
- [ ] On skill select: insert token in draft, e.g. `/capability-check` or internal `skill:capability-check` (parseable at Run).
- [ ] Track **activated skills** for this draft separately from free text (e.g. `ui.activatedSkillIds: string[]`).
- [ ] While typing `/`: **agent is not involved** — pure React/Preact UI.
- [ ] Optional builtins: thin aliases mapping to a skill id (same registry).

**Files:** `InputBar.tsx`, `SlashCommandPicker.tsx`, `skill-registry.ts`, `parse-skill-md.ts`

**Acceptance:**

1. Type `/` → palette lists skills with descriptions (metadata only).
2. Select skill → visible in input; agent not started.
3. `@` and `/` pickers do not conflict.

---

### Layer 2a — Activation inject (mandatory)

**Problem:** User picked a skill in Layer 1 but agent never receives the full `SKILL.md` body.

**Goal:** On **Run**, resolve activated skills and inject instructions **before** the agent loop’s first model call.

- [ ] `resolveActivatedSkills(draft)` → `SkillActivation[]` from tokens + `activatedSkillIds`.
- [ ] `buildTaskWithSkills(userText, activations)`:

  ```text
  [Skill: capability-check]
  <full SKILL.md body, no frontmatter>
  ---
  User task: <user text>
  ```

- [ ] Pass result as `agentStart.task` (or equivalent first user message). Visible in diagnostics/export.
- [ ] `disable-model-invocation: true` skills: inject **only** if user activated via `/` (Layer 1), never from system auto-list alone.
- [ ] Size cap + truncate with `[skill truncated]` marker.

**Files:** `resolve-skill-activations.ts`, `app.tsx` `handleRun`, `worker-bridge.ts` / `agentStart` payload

**Acceptance:**

1. `/capability-check` + Run → first turn includes full skill body (not just the slash label).
2. Run without `/` → no skill body injected (unless Layer 2c auto applies later).

---

### Layer 2b — `get_skill` tool (mandatory)

**Problem:** Agent needs skill text **during** a run (progressive disclosure, references/, skills not activated at compose time).

**Goal:** Mirror `get_doc`: agent calls a tool; receives markdown in **`tool_result`**.

- [ ] Add `get_skill` to `createAgentTools()` in `agent-tools.ts`:

  ```typescript
  get_skill({
    skill: string;           // required, e.g. "capability-check"
    path?: string;           // optional, e.g. "references/checklist.md"
  }): string                // markdown or JSON, size-capped
  ```

- [ ] No `path` → `SkillRegistry.loadSkillBody(skill)`.
- [ ] With `path` → `SkillRegistry.loadSkillResource(skill, path)` under skill root only (no `..`).
- [ ] Unknown skill / path → structured tool error with `hint` + `recovery` (same pattern as `get_doc` failures).
- [ ] Register in `anthropic-prompts.ts` tool list + describe in `SYSTEM_PROMPT`:
  - Use `get_skill` when following a skill listed in system metadata but not injected.
  - Use `get_skill({ path })` when skill body points at `references/`.
- [ ] Trace shows `get_skill` like `get_doc` (tool name + truncated result).

**No SDK changes** — same pattern as `get_doc`; worker + sidepanel registry only.

**Acceptance:**

1. Agent can `get_skill({ skill: "capability-check" })` and receive full body in tool result.
2. `get_skill({ skill: "x", path: "references/foo.md" })` returns file content.
3. Works on a run **without** Layer 2a inject (tool-only path).

---

### Layer 2c — System metadata catalog (mandatory for 2b to be useful)

- [ ] Inject into `SYSTEM_PROMPT` (compact, every run):

  ```text
  Available skills (use get_skill to load body; user may activate with /name at compose time):
  - capability-check: <description from frontmatter>
  - fill-and-submit: ...
  ```

- [ ] Metadata only — not full `SKILL.md` bodies (those come from 2a inject or 2b tool).
- [ ] Respect `disable-model-invocation: true`: list in catalog but document “load only via `/` activation or explicit `get_skill` when user asks”.

---

### How skills work elsewhere (reference)

| Layer | What loads | When |
|-------|------------|------|
| **Metadata** | `name`, `description` from YAML frontmatter (~100 tokens/skill) | Host startup — agent sees catalog |
| **Instructions** | Full `SKILL.md` markdown body | When skill is **activated** (auto or `/name`) |
| **Resources** | `scripts/`, `references/`, `assets/` | **Progressive disclosure** — only when skill text tells agent to read them |

**Discovery paths (Cursor):** `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/`, `~/.cursor/skills/` (recursive `**/SKILL.md`).

**Invocation modes:**

- **Auto** — host puts skill metadata in context; model decides relevance from `description`.
- **Manual** — user types `/skill-name` in chat; or frontmatter `disable-model-invocation: true` (slash-only).

**Standard folder layout:**

```text
capability-check/
├── SKILL.md          # required: frontmatter + instructions
├── references/       # optional: loaded on demand
├── scripts/          # optional: executables (host-specific)
└── assets/           # optional: templates, data
```

**`SKILL.md` frontmatter (required fields):**

```yaml
---
name: capability-check        # must match directory name
description: Runs a structured page capability probe via run_js. Use when testing Browsergent on the current tab or when the user asks for a capability check.
disable-model-invocation: true   # recommended for Browsergent v1: explicit / only
compatibility: Browsergent Chrome extension; requires run_js and get_doc.
metadata:
  version: "1.0"
---
```

Body = step-by-step workflow (your long capability-check prompt belongs here as a skill, not hardcoded in chat).

### Can Browsergent add this?

**Yes.** Skills map cleanly to Browsergent:

| Standard concept | Browsergent mapping |
|------------------|---------------------|
| Skill instructions | Injected into **system prompt** and/or first **user message** for the run |
| `scripts/` | Not shell — **`run_js` snippets** in `scripts/*.js` or markdown code blocks the agent copies |
| `references/` | Resolved via **`@file`** (§3) or new tool **`get_skill_ref`** |
| Auto-discovery | Append skill **metadata list** to `SYSTEM_PROMPT` in `anthropic-prompts.ts` |
| `/skill-name` | §4 palette → `SkillRegistry.activate(name)` |
| Progressive disclosure | New agent tool **`get_skill`** (mirror `get_doc`): `{ skill, section? }` returns body or `references/foo.md` |

**Constraints (be explicit in skill docs):**

- Agent’s only browser tool is **`run_js`** (+ **`get_doc`**, + future **`get_skill`**).
- Skills must not assume `bash`, repo file access, or Cursor MCP — unless `compatibility` says otherwise.
- `allowed-tools` (experimental in spec) could map to `run_js`, `get_doc`, `get_skill` only.

### Why agents will understand good errors + skills

Modern models **do** follow structured workflows when the skill body is in context. They fail when:

- Only a vague slash label is inserted without the full `SKILL.md` body.
- Skill says “use page.fill” but `get_doc` wasn’t called (skill should say: call `get_doc` first).

Skills are **procedural prompts with optional attachments** — a good fit for Browsergent.

### Implementation order (within §6)

1. `SkillRegistry` + bundled `public/skills/**` + CI validation
2. **Layer 1** — `/` palette
3. **Layer 2a** — inject on Run
4. **Layer 2b** + **2c** — `get_skill` tool + system metadata catalog
5. Ship first-party skills:
   - `capability-check/` — developer probe prompt from conversation exports
   - `fill-and-submit/` — golden-path form workflow
   - `create-skill/` — optional; skill authoring for Browsergent (follow agentskills.io layout)

#### Phase D — User skills (optional, ties to §2 Files)

- [ ] Import skills from Files panel: user drops `my-skill/SKILL.md` under `skills/` in session FS.
- [ ] Merge with bundled registry (user overrides win on name collision).
- [ ] Export/import skill folders in conversation export (optional).

### Browsergent-specific skill authoring guide

Write skills for **browser agent**, not IDE agent:

```markdown
## Instructions
1. Call get_doc({ namespace: "page" }) if unsure of API shapes.
2. Use page.snapshot() for overview; page.snapshot_data() before fill/click.
3. Use page.fill({ refId, value }) object form only.
4. One probe per run_js cell; log results with console.log.
5. If E_CONTENT_SCRIPT: follow recovery in error (page.goto current URL).

## Scripts
- scripts/probe-metadata.js — copy into run_js for step 1
```

### Files to add

```text
public/skills/
  capability-check/SKILL.md
  fill-and-submit/SKILL.md
src/skills/
  parse-skill-md.ts       # frontmatter + body
  skill-registry.ts       # discover, list, load
  skill-types.ts          # SkillMeta, SkillDocument
src/worker/agent-tools.ts # get_skill handler (Phase B)
tests/unit/skill-registry.spec.ts
```

### Acceptance criteria (all mandatory layers)

**Layer 1**

1. `/` shows skill list from metadata; selecting does not start agent.

**Layer 2a**

2. `/capability-check` + Run → task includes full skill body; matches `browsergent-conversation-*.json` probe behavior.
3. `disable-model-invocation: true` → no inject unless user activated via `/`.

**Layer 2b + 2c**

4. `get_skill({ skill })` returns body in tool_result without prior inject.
5. `get_skill({ skill, path })` returns `references/*` content.
6. System prompt lists skill metadata only; bodies not duplicated at startup.

**Shared**

7. Invalid `SKILL.md` fails CI validation (`skills-ref` or unit tests), not runtime.
8. End-to-end: compose `/skill` → inject on Run **and** agent can `get_skill` for another skill mid-run.

### References

- [Cursor Agent Skills docs](https://cursor.com/docs/skills)
- [agentskills.io specification](https://agentskills.io/specification)
- Browsergent probe prompt → candidate content for `public/skills/capability-check/SKILL.md`
