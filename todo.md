# Browsergent TODO

## Priority (suggested order)

1. **§6 closure** — E2E acceptance + inject size cap (core layers **done** in code; see `PLAN.md` WU-1)
2. **Files panel (§2)** — replace JS tab (`PLAN.md` WU-2–WU-4)
3. **`@` mentions (§3)** — file context in task input (`PLAN.md` WU-5–WU-6)
4. **§6 Phase D** (optional) — user skills from Files panel (`PLAN.md` WU-7)
5. **§7 Multi-line input** — Shift+Enter for newline, Enter to send
6. **§8 Direct file tools** — native read/edit/delete/ls tools for the agent (not only through `run_js`)
7. **§9 Chat file drop** — drag-and-drop files onto chat input → upload to OPFS + auto-attach to task
8. **§10 `run_js` file reference** — expose `run_js` with a direct file reference so agent can execute uploaded scripts

§4 is folded into §6 Layer 1 (not a separate optional track).

**Execution plan:** see [`PLAN.md`](./PLAN.md) for work units, locked decisions, and acceptance criteria.

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

- [x] `SkillRegistry` at sidepanel init: OPFS under `/skills/bundled/**` (seeded from `public/skills/bundled/`); user skills deferred to §6 Phase D.
- [x] `listSkills(): SkillMeta[]` — `name`, `description`, `disableModelInvocation`, paths for UI badges.
- [x] **`/` palette** (`CommandPicker` in `InputBar.tsx`): fuzzy filter on name/description; shared picker primitive ready for `@` (§3).
- [x] On skill select: insert token `/skill:{name} ` (parseable at Run via `parseSkillActivation`).
- [ ] Track **activated skills** for this draft separately from free text (e.g. `ui.activatedSkillIds: string[]`) — **deferred v1**: single `/skill:name` token in draft is sufficient.
- [x] While typing `/`: **agent is not involved** — pure Preact UI.
- [ ] Optional builtins: thin aliases mapping to a skill id (same registry) — not needed for v1.

**Files:** `InputBar.tsx`, `CommandPicker.tsx`, `skill-registry.ts`, `parse-skill-md.ts`, `skill-service.ts`

**Acceptance:**

1. Type `/` → palette lists skills with descriptions (metadata only).
2. Select skill → visible in input; agent not started.
3. `@` and `/` pickers do not conflict.

---

### Layer 2a — Activation inject (mandatory)

**Problem:** User picked a skill in Layer 1 but agent never receives the full `SKILL.md` body.

**Goal:** On **Run**, resolve activated skills and inject instructions **before** the agent loop’s first model call.

- [x] `parseSkillActivation(draft)` → `SkillActivation` from `/skill:{name}` token (single skill v1).
- [x] `buildResolvedTask` / `resolveTaskWithSkill` — XML `<skill>` block + optional `User task:` remainder.

- [x] Pass `resolvedTask` on `agentStart`; original `task` kept for display/export.
- [x] `disable-model-invocation: true` skills: inject **only** if user activated via `/skill:`; excluded from catalog; `load_skill` gated by `activatedSkills` whitelist.
- [x] Size cap + truncate with `[skill truncated]` marker on inject (tool results already capped in `agent-tools.ts`).

**Files:** `resolve-skill-activations.ts`, `app.tsx` `handleRun`, `worker/index.ts` / `agentStart` payload

**Acceptance:**

1. `/capability-check` + Run → first turn includes full skill body (not just the slash label).
2. Run without `/` → no skill body injected (unless Layer 2c auto applies later).

---

### Layer 2b — `load_skill` tool (mandatory; spec name was `get_skill`)

**Problem:** Agent needs skill text **during** a run (progressive disclosure, references/, skills not activated at compose time).

**Goal:** Mirror `get_doc`: agent calls a tool; receives markdown in **`tool_result`**.

- [x] Add `load_skill` to `createAgentTools()` in `agent-tools.ts` (relay to sidepanel `SkillService.loadSkill`).

  ```typescript
  load_skill({
    skill: string;           // required, e.g. "capability-check"
    path?: string;           // optional, e.g. "references/checklist.md"
  }): string                // markdown, size-capped
  ```

- [x] No `path` → `SkillRegistry.loadSkillBody(skill)`.
- [x] With `path` → `SkillRegistry.loadSkillResource(skill, path)` under skill root only (no `..`).
- [x] Unknown skill / path → structured tool error with `hint` + `recovery` (same pattern as `get_doc` failures).
- [x] Register in `anthropic-prompts.ts` tool list + describe in `composeSystemPrompt`.
- [x] Trace shows `load_skill` like `get_doc` (tool name + truncated result).

**No SDK changes** — same pattern as `get_doc`; worker + sidepanel registry only. **Locked:** keep tool name `load_skill` (do not rename to `get_skill`).

**Acceptance:**

1. Agent can `get_skill({ skill: "capability-check" })` and receive full body in tool result.
2. `get_skill({ skill: "x", path: "references/foo.md" })` returns file content.
3. Works on a run **without** Layer 2a inject (tool-only path).

---

### Layer 2c — System metadata catalog (mandatory for 2b to be useful)

- [x] Inject `<available_skills>` XML catalog via `formatSkillCatalog` on every run (`composeSystemPrompt`).

- [x] Metadata only — not full `SKILL.md` bodies (those come from 2a inject or 2b tool).
- [x] Respect `disable-model-invocation: true`: excluded from catalog; `load_skill` blocked unless user activated at compose time

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

1. [x] `SkillRegistry` + bundled `public/skills/bundled/**` + unit validation (`tests/unit/skill-*.spec.ts`)
2. [x] **Layer 1** — `/` palette
3. [x] **Layer 2a** — inject on Run
4. [x] **Layer 2b** + **2c** — `load_skill` tool + system metadata catalog
5. [x] Ship first-party skills:
   - `capability-check/` — developer probe prompt
   - `fill-and-submit/` — golden-path form workflow
   - `create-skill/` — skill authoring for Browsergent
6. [ ] **Closure:** inject size cap, Playwright E2E for compose → inject → `load_skill` mid-run

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

### Files (implemented)

```text
public/skills/bundled/
  capability-check/SKILL.md
  fill-and-submit/SKILL.md
  create-skill/SKILL.md
src/skills/
  parse-skill-md.ts, skill-registry.ts, skill-types.ts, skill-service.ts
  resolve-skill-activations.ts, format-skill-catalog.ts, seed-bundled-skills.ts
src/worker/agent-tools.ts   # load_skill relay
src/sidepanel/components/CommandPicker.tsx, InputBar.tsx
tests/unit/skill-*.spec.ts, tests/unit/input-bar.spec.tsx, ...
tests/skill-compose-inject.spec.ts   # TODO (E2E closure)
```

### Acceptance criteria (all mandatory layers)

**Layer 1**

1. `/` shows skill list from metadata; selecting does not start agent.

**Layer 2a**

2. `/capability-check` + Run → task includes full skill body; matches `browsergent-conversation-*.json` probe behavior.
3. `disable-model-invocation: true` → no inject unless user activated via `/`.

**Layer 2b + 2c**

4. [x] `load_skill({ skill })` returns body in tool_result without prior inject (unit tests).
5. [x] `load_skill({ skill, path })` returns `references/*` content (unit tests).
6. [x] System prompt lists skill metadata only; bodies not duplicated at startup.

**Shared**

7. [x] Invalid `SKILL.md` surfaces as `SkillDiagnostic` at init; unit tests in `validate-skill-meta.spec.ts`.
8. [x] End-to-end: compose `/skill:` → inject on Run **and** agent can `load_skill` for another skill mid-run (Playwright).

### Baseline correctness (pi parity, 2026-06-09)

- [x] Enforce `disable-model-invocation` on `load_skill` via per-run `activatedSkills` whitelist
- [x] Standards-compliant YAML frontmatter (`yaml` package; arrays, multiline, comments)
- [x] Skill name/description validation per agentskills.io; XML-safe skill injection
- [x] OPFS seed cleanup removes retired bundled files on manifest version change
- [x] Validation and collision diagnostics (`SkillDiagnostic`; `console.debug` on init)
- [x] Picker refresh via `SkillService.refresh()` / `subscribeSkillsChanged()` + input focus
- [x] Manifest SHA-256 verification before writing seeded bundled files

### References

- [Cursor Agent Skills docs](https://cursor.com/docs/skills)
- [agentskills.io specification](https://agentskills.io/specification)
- Browsergent probe prompt → candidate content for `public/skills/capability-check/SKILL.md`

---

## 7. Multi-line input (Shift+Enter for newline)

**Problem:** Currently `Enter` sends the task immediately. There is no way to write multi-line tasks (e.g., pasted code, step-by-step instructions, multi-paragraph prompts) without the agent starting prematurely.

**Goal:** `Enter` sends, `Shift+Enter` inserts a newline. The input should grow to fit content (auto-resize textarea).

### UI behavior

- [x] Replace `<input>` with `<textarea>` in `InputBar.tsx` (required for multi-line)
- [x] `Enter` (without modifiers) → send (call `onRun`)
- [x] `Shift+Enter` → insert newline, do not send
- [x] Auto-resize: textarea height grows with content up to a max (e.g., 40vh), then scrolls
- [x] Reset height to single-line when draft is cleared (after send)
- [x] Picker (`@` / `/`) still works: anchored to cursor position in textarea

### Plumbing

- [x] Update `inputRef` type from `HTMLInputElement` to `HTMLTextAreaElement`
- [x] Update `onKeyDown` handler: check `e.shiftKey` before triggering send on Enter
- [x] Update `refreshPickerState` and `applyPickerSelection` to work with textarea selection API
- [x] CSS: `resize: none`, `min-h` / `max-h` for auto-grow, `overflow-y: auto` when tall

### Acceptance criteria

1. `Enter` sends the task (same as today).
2. `Shift+Enter` inserts a visible newline; task is not sent.
3. Textarea grows with content and does not push the chat area off-screen.
4. After send, textarea resets to single-line height.
5. `@` and `/` pickers still open and insert correctly in multi-line content.
6. Cursor position and selection still work after picker insertion.

**Problem:** The agent can only interact with uploaded files by reading their content through `@[file:...]` mention injection at compose time. During a run, the agent has no way to read, edit, delete, or list files — it would need to emit `run_js` code that calls OPFS APIs, which is fragile and indirect.

**Goal:** Expose native agent tools for file operations, similar to how `load_skill` exposes skill resources.

### Tools

- [ ] `file_read({ path })` — read file content from OPFS session store; text only; size-capped
- [ ] `file_edit({ path, patch })` — apply a text patch (diff or full replacement) to an existing file
- [ ] `file_delete({ path })` — remove a file from the session's OPFS store and index
- [ ] `file_list({ prefix? })` — list files in the current session's store; optional prefix filter

### Plumbing

- [ ] Route tool calls through `agent-tools.ts` → worker relay → sidepanel `FilesController` (same pattern as `load_skill`)
- [ ] `FilesController` already has `readFileText`, `deleteFile`, `listSessionFiles` — expose via tool interface
- [ ] Add `editFile` method to `FilesController` (read → apply patch → write → update index)
- [ ] Add tool descriptions to `js-tool-prompt.ts` or `anthropic-prompts.ts`
- [ ] Trace entries for file tools (same as `run_js` / `load_skill`)

### Acceptance criteria

1. Agent can `file_list()` and see session files during a run.
2. Agent can `file_read({ path: "notes.md" })` and receive file content.
3. Agent can `file_edit({ path: "notes.md", patch: "..." })` and the file is updated in OPFS + index.
4. Agent can `file_delete({ path: "notes.md" })` and the file is removed.
5. Tools only access files within the current session's OPFS scope (path traversal blocked).

---

## 8. Chat input file drop → upload + auto-attach

**Problem:** Users must switch to the Files tab, upload a file, switch back to Chat, and type `@[file:...]`. This is cumbersome for the common case of "attach this file and do something with it."

**Goal:** Drag-and-drop (or paste) a file directly onto the chat input bar → upload to OPFS → auto-insert `@[file:...]` token into the draft.

### UI behavior

- [x] Detect `drop` / `paste` events on the task input or input bar area
- [x] On file drop: upload to OPFS via `FilesController.uploadFiles`, add to store
- [x] After upload, insert `@[file:id:filename]` token into the task draft at cursor position
- [x] Show a brief upload indicator (spinner or progress) while uploading
- [x] Support multiple files: one token per file, inserted sequentially

### Plumbing

- [x] `InputBar.tsx` — `onDrop` / `onPaste` handlers that call `FilesController.uploadFiles`
- [x] Need access to `FilesController` in `InputBar` (via props or store)
- [x] Need access to `sessionId` in `InputBar` (from store)
- [x] `onFilesChanged` callback to flush session save after upload

### Acceptance criteria

1. Drop a `.txt` file onto the input → file uploads, `@[file:...]` token appears in draft.
2. Drop multiple files → all uploaded, all tokens inserted.
3. Run with the token → agent receives file content as attachment.
4. Drop a binary file → token inserted, but mention resolution shows "File is not text" error.
5. Paste an image → handled gracefully (upload as binary or reject with message).

---

## 9. `run_js` with file reference

**Problem:** The agent's only tool is `run_js`, which takes inline JS code. If a user uploads a script file (`.js`) via the Files panel or drops it on the input, the agent cannot execute it directly — it would need to read the file content and embed it in a `run_js` call.

**Goal:** Allow `run_js` to accept a file reference, so the agent can execute an uploaded script without manually reading and inlining its content.

### Tool enhancement

- [ ] Extend `run_js` tool input schema with optional `file?: { id: string }` parameter
- [ ] When `file` is provided: read file content from OPFS → prepend/replace as the code to execute
- [ ] When both `code` and `file` are provided: `file` content runs first, then `code` (or `code` overrides — TBD)
- [ ] Update `js-tool-prompt.ts` to document the `file` parameter

### Plumbing

- [ ] `agent-tools.ts` — resolve file reference before sending to `relayExtjsExecution`
- [ ] `FilesController.readFileText(sessionId, fileId)` — already exists
- [ ] Need session ID and files controller access in the worker relay path
- [ ] Trace entry shows file reference + execution result

### Acceptance criteria

1. Agent calls `run_js({ file: { id: "abc" } })` → file content is loaded from OPFS and executed.
2. Agent calls `run_js({ code: "...", file: { id: "abc" } })` → both are available (exact semantics TBD).
3. File not found or not text → structured tool error with hint.
4. File content is still subject to the same size/cap limits as inline code.
