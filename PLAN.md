# Browsergent Implementation Plan

**Source:** `todo.md` (synced 2026-06-09)  
**Goal:** Close §6 Skills, ship Files panel (§2), wire `@` file mentions (§3).

---

## Locked decisions (do not re-debate)

| Topic | Decision |
|-------|----------|
| Skill runtime tool name | **`load_skill`** (already shipped; do not rename to `get_skill`) |
| Skill compose token | **`/skill:{name}`** with optional args after space (`fill-and-submit email@x.com pass`) |
| Activated skills state | **v1:** parse single token from draft; no separate `ui.activatedSkillIds` slice |
| Skill storage | **OPFS** via `extension-js` `fs.*` (same as bundled skill seed) |
| Session file storage | **OPFS** at `/session-files/{sessionId}/…`; metadata index in session snapshot (IndexedDB) |
| `@` file token format | **`@[file:{fileId}:{displayName}]`** — parseable, unambiguous, stable across renames if id kept |
| JS tab | **Remove entirely**; agent `run_js` relay via `ExtensionJsClient` **unchanged** |
| Picker UI | Reuse **`CommandPicker`** + `filterPickerItems` for both `/` and `@` |
| Binary files | Preview shows name + size only; do not inject binary into model context |
| Large file inject | Cap per file (default **32 KiB**); append `[truncated]` marker in attachment block |
| Phase D user skills | **Out of scope** for WU-1–WU-6; optional WU-7 after `@` mentions work |

---

## Work units

### WU-1 — §6 Skills closure

**Focus:** Finish remaining §6 acceptance; no new features.

**Key files:**
- `src/skills/resolve-skill-activations.ts` — inject body size cap
- `tests/skill-compose-inject.spec.ts` (new) — Playwright E2E
- `tests/helpers.ts` — reuse `launchExtension`, mock or stub Anthropic if needed

**Tasks:**
1. Add `MAX_SKILL_INJECT_CHARS` (suggest 32_000) in `resolve-skill-activations.ts`; truncate body with `\n\n[skill truncated]` when exceeded.
2. Unit test: oversized skill body → truncated resolved task.
3. Playwright E2E:
   - Open side panel, type `/skill:capability-check` via picker or direct input.
   - Run with test API key / mock provider (follow `tests/golden-path-fill-submit.spec.ts` patterns).
   - Assert `resolvedTask` or first user message in export/diagnostics contains skill XML block.
   - Assert agent can call `load_skill` for a different skill (e.g. `fill-and-submit`) mid-run — verify trace entry `toolName === "load_skill"`.
4. Mark §6 acceptance #8 done in `todo.md`.

**Acceptance criteria:**
- [ ] Inject truncates oversized skill bodies with explicit marker.
- [ ] `npm run test:unit` passes (new unit test included).
- [ ] `tests/skill-compose-inject.spec.ts` passes in `npm run test`.
- [ ] No regression to existing skill unit tests.

---

### WU-2 — Remove JS tab; add files state foundation

**Focus:** Delete playbook UI; introduce typed files slice and tab switch.

**Key files:**
- `src/sidepanel/app.tsx` — remove `JsPlaybookPanel`, add `FilesPanel` stub
- `src/sidepanel/components/JsPlaybookPanel.tsx` — delete
- `src/state/slices/ui-slice.ts` — `UiTab: "chat" | "files"`; remove `jsCodeDraft`
- `src/state/slices/files-slice.ts` (new)
- `src/state/store.ts`, `src/state/selectors.ts`
- `tests/js-playbook-fill-form.spec.ts` — delete
- `tests/unit/ui-slice.spec.ts` — update

**Tasks:**
1. Change `UiTab` to `"chat" | "files"`; default `"chat"`.
2. Remove JS tab button; add Files tab (label or icon).
3. Add `files-slice.ts`:

   ```typescript
   type FileNodeId = string;
   interface FileNode {
     id: FileNodeId;
     name: string;
     path: string;        // OPFS path relative to session root
     kind: "file" | "directory";
     parentId: FileNodeId | null;
     size?: number;
     mime?: string;
   }
   ```

4. State: `nodes: Record<FileNodeId, FileNode>`, `rootIds`, `selectedFileId`, `expandedDirIds`.
5. Audit worker: remove panel-initiated `extjsRun` paths only used by playbook UI; keep agent relay.
6. Placeholder `FilesPanel.tsx` renders "No files yet".

**Acceptance criteria:**
- [ ] No JS tab in header; Chat tab still works.
- [ ] Agent chat + `run_js` trace unchanged (smoke: `tests/extension-smoke.spec.ts`).
- [ ] `jsCodeDraft` / `setJsCodeDraft` / `selectJsCodeDraft` removed.
- [ ] `npm run typecheck` clean.

---

### WU-3 — Files panel UI (tree, preview, upload)

**Focus:** Full Files panel UX backed by OPFS.

**Key files:**
- `src/sidepanel/components/FilesPanel.tsx`
- `src/controllers/files-controller.ts` (new) — OPFS CRUD via `ExtensionJsClient`
- `src/sidepanel/styles.css`

**Tasks:**
1. **Upload:** file input + drag-and-drop on tree area; multi-file; write to `/session-files/{sessionId}/{relativePath}`.
2. **Tree:** expand/collapse directories; click file → select for preview.
3. **Preview:** text for `.md`, `.txt`, `.json`, `.js`, `.ts`; markdown render optional (plain text OK for v1).
4. **Binary:** show `{name} — {size} bytes (preview not available)`.
5. **Delete** (optional v1): single-file delete from context menu or button.
6. `data-testid` hooks: `files-panel`, `file-tree`, `file-preview`, `file-upload`.

**Acceptance criteria:**
- [ ] User uploads `.md` file → appears in tree → preview shows content.
- [ ] Upload `.png` → tree entry + size-only preview.
- [ ] Switching away from Files tab and back preserves selection.
- [ ] Unit tests for `files-controller` path helpers / node building (at least one).

---

### WU-4 — Files session persistence

**Focus:** Files survive session switch when session persistence is enabled.

**Key files:**
- `src/controllers/session-controller.ts`
- `src/controllers/files-controller.ts`
- `src/state/slices/files-slice.ts`

**Tasks:**
1. Extend `SessionData` with optional `filesIndex: FileNode[]` (metadata only; blobs stay in OPFS).
2. On session save: persist `filesIndex` alongside messages/trace.
3. On session activate: hydrate `files-slice` from index; verify OPFS paths under that session id.
4. New session → empty files tree.
5. Delete session → remove OPFS `/session-files/{sessionId}/` (best-effort).

**Acceptance criteria:**
- [ ] Upload file in session A → switch to session B → switch back to A → file still listed and previewable.
- [ ] `tests/session-persistence.spec.ts` extended or new `tests/files-session-persistence.spec.ts`.
- [ ] No cross-session file leakage.

---

### WU-5 — `@` mention picker (compose-time)

**Focus:** Layer 1 analogue for files; reuse `CommandPicker`.

**Key files:**
- `src/sidepanel/components/InputBar.tsx`
- `src/sidepanel/components/FileMentionPicker.tsx` (thin wrapper or inline — prefer minimal)
- `src/sidepanel/detect-mention-state.ts` (new) — mirror `detectSlashState`

**Tasks:**
1. `detectAtState(value, cursor)` — `@` at word boundary; query = text after `@` until space.
2. Picker lists session files (flat list OK for v1; tree order nice-to-have).
3. On select: insert `@[file:{id}:{name}]` token.
4. Keyboard: ↑↓ Enter Esc — same as `/` picker.
5. **`/` and `@` do not conflict:** only one picker open; `@` takes precedence if both detected (or mutually exclusive cursor contexts).

**Acceptance criteria:**
- [ ] Type `@` → see session files → pick → token in input.
- [ ] Unit tests for `detectAtState` and token insertion.
- [ ] `/` skill picker still works when no `@` active.

---

### WU-6 — `@` mention agent plumbing

**Focus:** Resolve tokens at Run; inject structured attachments into model context.

**Key files:**
- `src/sidepanel/resolve-file-mentions.ts` (new)
- `src/sidepanel/app.tsx` — `handleRun`
- `src/worker/agent-loop.ts` or message assembly — use `resolvedTask`
- `src/worker/js-tool-prompt.ts` — document `@` semantics

**Tasks:**
1. `parseFileMentions(draft): FileMention[]` from `@[file:id:name]` tokens.
2. `resolveFileMentions(mentions, filesController): ResolvedAttachment[]` — read OPFS text; cap size; `[truncated]` marker.
3. `buildTaskWithAttachments(userText, attachments)` — XML or markdown block before user task (match skill inject style).
4. Merge with skill resolution: skills first, then file attachments, then user remainder.
5. Missing file id → block run with system message error (before `agentStart`).
6. Export/diagnostics include resolved attachment metadata (not necessarily full blob).

**Acceptance criteria:**
- [ ] Run with `@[file:…:notes.md]` → model receives file content (verify via export snapshot or mock provider).
- [ ] `@missing` / broken id → clear error; agent not started.
- [ ] Unit tests for parse + resolve + truncate.
- [ ] Agent prompt mentions `@` file attachments.

---

### WU-7 — User skills from Files (optional / Phase D)

**Focus:** §6 Phase D — only after WU-4.

**Key files:**
- `src/skills/skill-registry.ts` — merge user + bundled scopes
- `src/skills/skill-service.ts`

**Tasks:**
1. If user uploads `my-skill/SKILL.md` under `skills/` in session FS, register as `scope: "user"`.
2. Name collision: user overrides bundled (diagnostic logged).
3. `SkillService.refresh()` after file upload/delete in `skills/`.

**Acceptance criteria:**
- [ ] Drop valid skill folder in Files → appears in `/` picker.
- [ ] `load_skill` can load user skill body.
- [ ] Invalid SKILL.md → diagnostic, not crash.

**Out of scope for initial goal statement** unless user explicitly extends scope.

---

## Final gate

All commands must exit 0:

```bash
npm install && npm run typecheck && npm run test:unit && npm run build && npm run test
```

---

## Must exist after WU-1–WU-6

```text
PLAN.md
src/state/slices/files-slice.ts
src/controllers/files-controller.ts
src/sidepanel/components/FilesPanel.tsx
src/sidepanel/resolve-file-mentions.ts
src/sidepanel/detect-mention-state.ts
tests/skill-compose-inject.spec.ts
tests/files-session-persistence.spec.ts   # or extended session-persistence.spec.ts
tests/unit/resolve-file-mentions.spec.ts
tests/unit/files-controller.spec.ts
```

**Must not exist:**
- `src/sidepanel/components/JsPlaybookPanel.tsx`
- `tests/js-playbook-fill-form.spec.ts`

---

## Out of scope

- Renaming `load_skill` → `get_skill`
- Multi-skill compose (`ui.activatedSkillIds` array)
- WU-7 user skills (unless scope extended)
- Conversation export of file blobs (metadata only OK)
- Cloud sync / cross-device files
- Syntax highlighting in Files preview (plain text OK)

---

## Suggested execution order

```text
WU-1 (skills closure)
  → WU-2 (remove JS + files slice)
  → WU-3 (files UI)
  → WU-4 (session persist)
  → WU-5 (@ picker)
  → WU-6 (@ plumbing)
  → [optional] WU-7
```

Each WU: implement → run unit tests for that WU → run full Final Gate before marking done.
