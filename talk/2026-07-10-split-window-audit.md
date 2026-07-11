# 2026-07-10 — Split window audit (B2)

**Supersedes** split-related rows in [`2026-07-09-window-isolation-audit.md`](./2026-07-09-window-isolation-audit.md) where they claim B2 / lifecycle E2E are unproven.

**Product rule (locked):** Drag tab → new window = **split**. Source window **keeps** its sessions. New window gets a **fresh session only on first sidepanel open** — must **not** inherit parent chat.

---

## What is implemented

| Layer | Evidence |
|-------|----------|
| **Index (B2)** | `applyWindowSplitToIndex` is a no-op on sessions; `planCreateSessionForWindow` mints FG on first attach. Unit: `session-index-lifecycle.spec.ts` |
| **SW correlation** | `WindowLifecycleTracker` — detach + `onWindowCreated` → `split`; merge vs split ordering. Unit: `window-lifecycle-tracker.spec.ts` |
| **SW emit** | `WindowSessionCoordinator` + `emitSplit`; listeners gated (`hasPanel`, `hasMergeTarget`) — Fix C in HANDOFF |
| **Panel** | `WindowContextController.init({ windowId })` + `resolveOrCreateForWindow`; reopen same window restores session (B1/B6 unit). `openSecondWindow` uses `?windowId=` |
| **UI on split event** | `app.tsx` lifecycle `split` → `reloadSessionList()` only (no session moves) |
| **Independent chat (B1)** | `two-window-sessions.spec.ts`, `second-window-boot.spec.ts` |

---

## What the mock E2E actually proves for “split”

| Test | What it does | B2 fidelity |
|------|----------------|-------------|
| `window-split-lifecycle.spec.ts` | `broadcastWindowSplit` + dual-window list openable | ✅ **Split lifecycle path** (SW message + storage, panels reload list) |
| `window-split-lifecycle.spec.ts` — *second window first panel* | Same as old window-lifecycle B2 attach test | ✅ Fresh session; no parent chat inherit |
| `second-window-boot.spec.ts` | Second panel shell-ready, distinct `windowId` | B8 boot, not product drag-split |
| `window-lifecycle-natural.spec.ts` | Natural **merge** via tab move | `test.fixme` — headless Chromium **does not** emit detach/attach for extension tab moves |

**Conclusion:** Mock suite **green for “two windows → independent empty/fresh panel”** (B1 + attach path). It does **not** certify **Chrome drag-split → SW split event → panels refresh list** end-to-end.

---

## Gaps (missing or weak)

### P0 — Product fidelity

1. **No E2E for real drag-split → first panel in new window**  
   Plan: `WINDOW_SESSION_ISOLATION_PLAN.md` Slice 3 — “drag tab → new window → first panel open”.  
   Blocker in automation: same as merge — Playwright headless often **no** `tabs.onDetached`/`onAttached` for extension windows (`window-lifecycle-natural.spec.ts` comment).  
   **Mitigation today:** manual HANDOFF §6 step 4; optional **headed** Playwright or `broadcastWindowSplit` helper (does not exist yet; merge has `broadcastWindowMerge`).

2. **B2 test name overclaims**  
   Rename or add a second test so “split” in the title matches either lifecycle broadcast or manual checklist ID.

3. **No integration test: split lifecycle → both panels**  
   After `windowLifecycle` split, both panels should reload list without corrupting `windowId` / openable flags. Only merge/close have broadcast E2E helpers.

### P1 — extension-js / acting

4. **New window `ExtensionSession.init({ windowId })`**  
   Exercised via second panel boot in E2E; not re-run after every IDB change in a dedicated split+run test (optional: run agent in B after drag-split manual).

5. **Split while agent running in source**  
   Product: source keeps run (panel still open). **No** E2E “run in A, drag tab to split, A still completes”.

### P2 — Docs / debt

6. **`WINDOW_SESSION_ISOLATION_PLAN.md`** Slice 3 checkbox still `[ ]` — should reflect unit + partial E2E.  
7. **`broadcastWindowSplit`** — ✅ `tests/helpers.ts` + `tests/window-split-lifecycle.spec.ts` (2026-07-10).

### Explicit non-gaps

- **Pre-create session on split event** — product says **no** session until panel open; `on_split_event` pre-create in plan table is **not** chosen behavior (`planCreateSessionForWindow` on first open only).
- **SW StorageActor** — not required for split correctness after IDB storm fix.

---

## Recommended next steps

1. Add `broadcastWindowSplit` in `tests/helpers.ts` + unit-level panel subscription test **or** one E2E “split event → list still shows foreign rows correctly”.  
2. Manual Chrome: drag tab out of A → open panel in new window → empty chat; A unchanged (**HANDOFF §6**).  
3. When harness supports it: un-`fixme` natural merge; add parallel **natural split** spec.  
4. Rename `window-lifecycle` B2 test to e.g. *“second window first panel open does not inherit parent chat”*.

---

## Verify split-related code

```bash
npx vitest run tests/unit/window-lifecycle-tracker.spec.ts tests/unit/session-index-lifecycle.spec.ts tests/unit/window-context-controller.spec.ts
npx playwright test tests/window-lifecycle.spec.ts tests/second-window-boot.spec.ts tests/two-window-sessions.spec.ts --workers=1
```