# End-to-End Refactor: Window Isolation First

**Status:** Implemented (host layer) — 2026-07-09  
**Owner:** Browsergent + web-js (extension-js)  
**Priority:** **Window split / merge is TOP priority** for every phase of this refactor  
**Supersedes for delivery order:** ad-hoc stability work that is not on the split/merge path  
**Does not supersede product locks** in `WINDOW_SESSION_ISOLATION_PLAN.md` (superseding note) or `HANDOFF.md`

### Implementation notes (2026-07-09)

| Area | Status |
|------|--------|
| Pure session-index lifecycle reducers | Done (`session-index-lifecycle.ts` + unit tests) |
| SW lifecycle single fanout (`storage.session`) | Done |
| Settings early load + fail-open loaded | Done |
| Lazy agent-worker / extension-js until Run | Done |
| Meta-first session list; idle trim | Done |
| Shell paint before body hydrate (B8) | Done |
| Non-blocking windowId resolve (SW + cache) | Done |
| Playwright extension DOM helpers / no CDP trace | Done |
| E2E: settings, smoke, window-isolation, second-window boot | Green |
| E2E: two-window full agent run (`two-window-sessions`) | Still flaky under multi-window mock LLM load |

---

## 0. Why this document exists

Window-level isolation was partially implemented (extension-js tab ownership + Browsergent session `windowId` / lifecycle coordinator). Real Chrome remains fragile: second-window boot storms, Settings blocked by session work, merge/split races, SW fanout, dual heavy runtimes per panel.

This plan is a **host-layer refactor** that keeps:

1. **extension-js acting model** (sandbox JS + safepost commands)  
2. **Locked product semantics** for windows and panel-close  
3. **Split/merge correctness** as the spine of every milestone  

Related sources (read before coding):

| Doc | Role |
|-----|------|
| [`WINDOW_SESSION_ISOLATION_PLAN.md`](./WINDOW_SESSION_ISOLATION_PLAN.md) | Grill decisions + B1–B7 behavior; offscreen cancelled |
| [`HANDOFF.md`](./HANDOFF.md) | Current fragile state, local hosting, diagnosis |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Three-repo stack, agent turn loop |
| [`AGENTS.md`](./AGENTS.md) | Types/tests/boundaries; panel-close ends runs |
| [`../web-js/PLAN_WINDOW_ISOLATION.md`](../web-js/PLAN_WINDOW_ISOLATION.md) | extension-js per-window runtime (Phases 1–4 done) |
| [`../web-js/HANDOFF.md`](../web-js/HANDOFF.md) | `init({ windowId })` / `rebindWindow` / `E_TAB_NOT_OWNED` |

---

## 1. Locked product decisions (do not re-litigate)

### 1.1 Window ↔ session attachment

| Rule | Decision |
|------|----------|
| Cardinality | **1 session → 1 windowId**; **1 window → N sessions** |
| Panel open rule | Panel may only open sessions where `session.windowId === panel.windowId` |
| Cross-window click | **Block** with English message; no hydrate / run / steer / delete |
| Parallel agents | **OK** across windows (each open panel); OK in-panel background sessions |
| Split | Source keeps its sessions; **new session only on first sidepanel open** in the new window |
| Merge | **both_on_survivor**: SA + SB attach to survivor; SA stays foreground, SB background; rebind `windowId` |
| Badge | Merged sessions show survivor window; pure close without merge may show closed label |
| Settings / API keys | **Global** |
| Files / OPFS | **Global** (v1 known limitation) |

### 1.2 Runs and “background”

| Term | Meaning |
|------|---------|
| **Foreground session** | Chat UI session in an open panel |
| **Background session (in-panel)** | Other sessions **in the same open panel** may still have local workers/runs |
| **Close side panel** | **All runs in that panel stop.** Data may remain in IDB. **No offscreen survival.** |
| **Offscreen host** | **Out of product scope** — do not rebuild panel-close keep-alive |

### 1.3 extension-js constraints (acting kernel — do not break)

| Constraint | Why |
|------------|-----|
| Model JS runs in **QuickJS sandbox** (no raw DOM / chrome) | Untrusted program |
| Side effects via **typed yield/resume (safepost)** | Single security + observability boundary |
| `page.*` / first-party DOM via **content-script channel** | Not `executeScript` internals |
| Per-panel `ExtensionSession` + `windowId` | Tab ownership (`E_TAB_NOT_OWNED`) |
| `rebindWindow(survivorId)` on merge survivor | Keep acting scoped after merge |
| Raw `chrome.*` parity may remain ungated | Transparency invariant; optional later |

**Browsergent refactors host assembly. It must not “simplify” by running agent JS in the page or sidepanel main world.**

---

## 2. Problem statement (architecture, not one bug)

### 2.1 What works

- Agent contract: LLM → `run_js` only → sandbox → content script  
- extension-js per-window **tab** isolation (mostly done)  
- Partial Browsergent session `windowId` / B1–B4 tests  

### 2.2 What is broken by structure

| Smell | Effect on split/merge |
|-------|------------------------|
| **God `useAppInit`** | Second window pays full IDE boot before shell is healthy; Settings/session race |
| **Eager runtimes** | Each panel loads agent-worker (~4MB) + extension-js WASM on open |
| **Shared IDB, full-hydrate lists** | Multi-window open triggers migrate/list storms (meta path helps; not finished as architecture) |
| **Lifecycle via heuristics** | detach/attach/create + `setTimeout(0)` → false merge/split |
| **Dual relay channels** | runtime message + `storage.session` → races, SW loops historically |
| **Ref-not-reactive controllers** | Second window UI stuck (Settings forever loading) |
| **Half-dead offscreen code** | Confuses merge “adopt run” paths that cannot survive panel close |

**Conclusion:** Split/merge cannot be made production-solid by more patches alone. Need a **host refactor with window lifecycle as the spine**, and **intent-driven load** so multi-window does not OOM or dead-block shell.

---

## 3. Target architecture

### 3.1 Layering

```text
┌─────────────────────────────────────────────────────────────┐
│ UI Shell (Preact)                                           │
│  Chat | Session list | Files | Settings                     │
│  Subscribes only; never opens IDB/OPFS/workers directly     │
└───────────────────────────┬─────────────────────────────────┘
                            │ commands / queries
┌───────────────────────────▼─────────────────────────────────┐
│ App services (testable, explicit lifecycle)                 │
│  WindowContextService   ← TOP: identity + split/merge       │
│  SessionIndexService    ← meta only                         │
│  SessionBodyService     ← one body by id                    │
│  SettingsService        ← global, light                     │
│  SkillsService          ← lazy                              │
│  FilesService           ← lazy tree                         │
│  AgentRunService        ← local panel runs only             │
│  ActingService          ← extension-js bridge               │
└───────────────────────────┬─────────────────────────────────┘
                            │ adapters
┌───────────────────────────▼─────────────────────────────────┐
│ Chrome adapters                                             │
│  IDB | chrome.runtime/SW messages | extension-js | tabs     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Service lifecycle (uniform)

```text
cold → loading → ready
            ↘ failed (retryable)
```

**Boot of a panel (only this):**

```text
1. Open IDB connection
2. SettingsService.ensureReady()     // 2 keys, never blocked by sessions
3. WindowContextService.bind()      // windowId + panelRegister
4. Paint shell (initialized)
// STOP — no agent worker, no extjs, no skills seed, no full file tree
```

**On demand:**

| Intent | Service |
|--------|---------|
| Open session drawer | `SessionIndex.list()` (meta only) |
| Open/switch chat | `SessionBody.open(id)` if openable |
| Files tab / expand folder | `Files.listChildren(path)` |
| `/skill` or Run needs catalog | `Skills.ensureReady()` + cached list |
| Run | `AgentRunService.start` → lazy Agent worker + Acting |
| Merge survivor | `WindowContext.applyMerge` → SessionIndex rebind + `Acting.rebindWindow` |

### 3.3 WindowContextService (heart of split/merge)

**Responsibilities:**

1. Own **panel instance** identity: `{ panelId, windowId }`  
2. Subscribe to SW lifecycle: `split | merge | close` (deduped)  
3. Apply pure reducers on session index (no UI in SW)  
4. Drive survivor `Acting.rebindWindow(survivorWindowId)`  
5. On panel dispose: abort all local runs; `panelUnregister`  

**SW responsibilities (keep thin):**

- Correlate tab detach/attach/window create/remove → emit lifecycle  
- Prefer **panel registry** as source of truth (“this window had a Browsergent panel”)  
- Fanout lifecycle **once** (pick **either** `runtime.sendMessage` **or** `storage.session`, not both long-term)  
- `safeListener` everywhere; no business IDB in SW  

**Split algorithm (product):**

```text
on split(sourceWindowId, newWindowId):
  // no session moves yet
  // when panel first opens in newWindowId:
  //   SessionIndex.createAttached(newWindowId) if none
```

**Merge algorithm (product):**

```text
on merge(removedWindowId, survivorWindowId):
  for each session with windowId == removed:
    session.windowId = survivor
    session.lifecycle = background  // survivor’s previous foreground stays FG if still open
  panelActiveSession[removed] deleted
  survivor panel: Acting.rebindWindow(survivor)
  runs: only those still hosted in an open panel continue
  closed panel’s runs are already dead — do not invent adopt-from-void
```

---

## 4. Target data model

### 4.1 Session index (list / openable / merge)

```typescript
interface SessionIndexRecord {
  id: string;
  windowId: number;
  lifecycle: "foreground" | "background";
  timestamp: number;
  title?: string;
  customTitle?: string;
  messageCount: number;
  bytes: number; // body size estimate for trim
}
```

Storage: `session_meta_<id>` (already directionally implemented).

### 4.2 Session body (chat only when open)

```typescript
interface SessionBodyRecord {
  id: string;
  messages: ChatMessage[];
  trace: AgentTraceEntry[];
  diagnostics: AgentDiagnosticEvent[];
  // windowId mirrored on write for recovery, index is source of truth for attachment
}
```

Storage: `session_<id>`.

### 4.3 Global panel meta

```typescript
interface PanelMeta {
  panelActiveSession: Record<string /* windowId */, string /* sessionId */>;
  closedWindowIds?: number[];
  // NO headlessRuns / offscreen adopt maps as product features
}
```

### 4.4 Run attachment (in-panel only)

```typescript
type RunAttachment = "foreground" | "background"; // both require open panel document
// RunHandle dies with panelInstanceId
```

---

## 5. Behavior contract (acceptance — TOP priority)

Black-box IDs from prior grill; **refactor is done when these are green on real Chrome**, not only mock E2E.

| ID | Observable | Forbidden |
|----|------------|-----------|
| **B1** | Two windows → independent sessions / active chats | Shared global single `activeSessionId` driving both panels |
| **B2** | Split + first panel open in new window → **fresh** session | Inheriting parent chat |
| **B3** | Merge → both sessions on survivor; FG/BG; `windowId` updated | Dropping SB; wrong window badge |
| **B4 / B4b** | Foreign rows disabled + English block | Opening cross-window session |
| **B5** | In-panel switch keeps other runs; **panel close stops all runs** | Requiring offscreen |
| **B6** | Reopen panel → hydrate IDB body for active session | Live subscribe to dead run |
| **B7** | Merge **while panels open** → rebind; runs continue only if host panel still open | Expecting run after panel gone |
| **B8 (new)** | Second window Settings / shell usable within ~1s without waiting full session migrate | Settings blocked on session trim |
| **B9 (new)** | Cold panel boot: no full OPFS tree walk; no skills seed until needed | Boot fsCall storms |
| **B10 (new)** | Cross-window `page.*` → `E_TAB_NOT_OWNED` | Silent wrong-tab actions |

**Test surfaces:** Playwright two-window (serial workers), unit pure lifecycle tracker, SessionIndex merge reducers, extension-js ownership tests (already exist).

---

## 6. Phased delivery (each phase must keep split/merge green)

### Phase 0 — Contract freeze + kill confusion (short)

**Goal:** One mental model before large moves.

- [ ] Mark offscreen / `headless-boot` **legacy** in code comments + README (already product-cancelled)  
- [ ] Single doc of truth: **this file** for refactor order; grill doc for product Q&A  
- [ ] Checklist B1–B10 as CI gate labels  

**Exit:** Team agrees B2/B3/B7 are non-negotiable for every later PR.

---

### Phase 1 — Window spine solid (TOP priority)

**Goal:** Split/merge logic is pure, testable, and not drowned by boot.

1. **Extract pure domain**  
   - `WindowLifecycle` events: `split | merge | close`  
   - `SessionIndex.applyMerge / applyClose / createForWindow` pure functions + unit tests  
2. **SW coordinator**  
   - Emit only when `registry.hasPanel` / known merge target (keep Fix C)  
   - **One** fanout channel for lifecycle (prefer `storage.session` with `emittedAt` **or** runtime, not both)  
   - `safeListener` + diag ring (already started)  
3. **Panel WindowContextService**  
   - `bind`, `subscribeLifecycle`, `dispose`  
   - On merge survivor: index rebind + `Acting.rebindWindow`  
4. **Boot order invariant**  
   - Settings + windowId bind **before** any full session body work  
   - `SessionIndex.list` meta-only; migrate missing meta **idle/sequential**, never block Settings  

**Exit:** Manual + Playwright: B1–B4, B7 (panels open); B8.

---

### Phase 2 — Session services (index vs body)

**Goal:** Multi-window open does not hydrate all chats.

- [ ] Formalize `SessionIndexService` / `SessionBodyService` APIs  
- [ ] Remove remaining full-body paths from list/find/trim  
- [ ] Idle migration queue (one body → meta at a time, yield to event loop)  
- [ ] CAS or version on `PanelMeta` for multi-writer windows (reduce clobber)  

**Exit:** Open 2–3 windows with large histories without OOM; B1–B3 still green.

---

### Phase 3 — Intent-driven runtimes (support multi-window load)

**Goal:** Second window does not double full IDE cost on paint.

- [ ] **AgentRunService:** create `agent-worker` only on first Run in that panel  
- [ ] **ActingService:** `ExtensionSession.init` only on first `run_js` / first required OPFS  
- [ ] Keep `init({ windowId })` / `rebindWindow` contract  
- [ ] Panel close: dispose Acting + terminate workers (already product intent)  

**Exit:** Cold open panel: no agent-worker, no extjs worker until needed; B5/B9.

---

### Phase 4 — Skills / Files as pure lazy services

**Goal:** No boot OPFS storms (partially done; finish as services).

- [ ] Skills: only on picker / Run catalog / load_skill / import (cache list)  
- [ ] Files: only Files tab + expand; shallow refresh only  
- [ ] Optional: OPFS namespace prefix `/skills` vs `/files` to avoid root-wide scans  
- [ ] fsCall queue tagged by owner for debugging  

**Exit:** B9; chat-only boot ≈ zero skill/file fsCalls.

---

### Phase 5 — Split/merge UX polish + real Chrome gate

**Goal:** Production confidence.

- [ ] Real Chrome checklist for B2/B3/B7 with drag-tab split and real merge  
- [ ] Running badge cross-window (display only; open still blocked)  
- [ ] English copy for block messages  
- [ ] Remove or quarantine dead offscreen adopt paths that imply survival  
- [ ] `npm run smoke` optional after stability  

**Exit:** HANDOFF status no longer “fragile” for multi-window core; B1–B10 documented pass.

---

## 7. What we explicitly will not do

| Out of scope | Reason |
|--------------|--------|
| Offscreen / keep run after panel close | Product lock |
| Per-window Settings / OPFS namespaces (v1) | Prior decision; optional later |
| Running agent JS in page main world | Breaks extension-js threat model |
| SW-side full agent host | Wrong place for WASM/LLM |
| Big-bang rewrite of pi-oxide | Acting/brain stack stays |

---

## 8. Mapping current code → target (mechanical guide)

| Today | Target |
|-------|--------|
| `use-app-init.ts` god boot | Thin shell boot + service ensureReady |
| `SessionController` (all-in-one) | Split index vs body vs panel meta |
| `window-session-coordinator.ts` + tracker | Keep pure tracker; thin SW emit; panel applies reducers |
| `RunSupervisor` | AgentRunService; lazy worker; local only |
| `ExtensionJsClient` singleton per panel | ActingService; lazy init; rebind on merge |
| `app.tsx` merge handler blob | WindowContextService.applyMerge |
| Dual `sessionRunRelay` + storage | Single channel or document “observe only while both open” |
| Legacy `headless/*`, offscreen proxy | Delete or `legacy/` after Phase 5 |

---

## 9. PR / test rules while refactoring

1. **Every PR must state which B-ids it preserves.**  
2. Prefer pure domain PRs (merge reducers) before Chrome wiring.  
3. TDD: failing B2/B3/B7 test first when touching lifecycle.  
4. No PR that reintroduces: full `listAllFiles` on boot, skills `ensureReady` on extjs init, settings after session-only gate without early load.  
5. Multi-window Playwright: `--workers=1` until stable; then real Chrome manual B2/B3/B7.

---

## 10. Success definition (end state)

Refactor is complete when:

1. **Split/merge** behave per §1 and §5 on **real Chrome**, not only unit mocks.  
2. Panel boot is a **shell** (settings + window bind); heavy systems are **intent-driven**.  
3. extension-js remains the **only** acting path (sandbox + safepost).  
4. Close panel **honestly** ends runs; no zombie offscreen promises.  
5. Second window is a normal peer: own store, own runs, shared index/settings data, no permanent “Loading settings…”.

---

## 11. Immediate next execution step (when approved)

**Phase 1, slice 1.1:** Extract pure `applyWindowMerge` / `applyWindowSplit` / `createSessionForWindow` from `SessionController` + unit tests that encode B2/B3 without Chrome; then wire coordinator emit → panel apply only.

Do **not** start with agent-worker lazy load until Phase 1 B2/B3/B7 are protected — load reduction helps multi-window but **must not reorder ahead of lifecycle correctness.**

---

## 12. Decision log (session 2026-07-09)

| Decision | Source |
|----------|--------|
| both_on_survivor merge | Grill Q1 |
| 1 session : 1 window; N sessions : 1 window | Grill Q2/Q6 |
| parallel_ok | Grill Q3 |
| block_with_message cross-window | Grill Q7 |
| Panel close ends runs; no offscreen | Product lock 2026-07-09 |
| In-panel background = concurrent runs in open panel | Product lock |
| extension-js safepost + window tab ownership | web-js plan / AGENTS |
| Intent-driven host services | Architecture review this session |
| Split/merge TOP priority in refactor order | User directive 2026-07-09 |

---

*Write path: `Browsergent/WINDOW_ISOLATION_REFACTOR.md` (project root). Update this file when phases complete; do not bury decisions only in chat.*
