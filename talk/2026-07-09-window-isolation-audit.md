# Window isolation process — status audit

> **⚠️ Superseded (2026-07-10)** for gate/E2E status. Use [`2026-07-10-e2e-green-and-status.md`](./2026-07-10-e2e-green-and-status.md) and [`2026-07-10-split-window-audit.md`](./2026-07-10-split-window-audit.md). This file is kept as historical context only.

**Date:** 2026-07-09  
**Purpose:** Stop and inventory — what is done vs not, without continuing implementation.  
**North star:** `WINDOW_ISOLATION_REFACTOR.md` (B1–B10 + phases 0–5)

---

## 1. Bottom line

| Question | Answer |
|----------|--------|
| Are we still *in* window isolation? | **Yes** — host refactor + multi-window stability |
| Is host-layer isolation “product complete”? | **No** — partial; dual full-agent E2E and formal Phase 2 services remain |
| Did we ship useful fixes? | **Yes** — boot/IDB/running-loop/test harness; several B* covered by unit + partial E2E |
| Why jump out of full E2E? | E2E was blocked by **self-inflicted IDB storms** + CDP multi-extension freezes; fixed root cause, then continued isolation plumbing |

---

## 2. B1–B10 contract scorecard

Legend: **Done** = code + evidence; **Partial** = code or unit only / flaky E2E; **Open** = not verified or incomplete.

| ID | Intent | Status | Evidence / gap |
|----|--------|--------|----------------|
| **B1** Independent sessions per window | **Partial → strong unit** | Unit: `window-context-controller` re-init + bindPanelWindow + `getActiveSessionId`; second-window-boot E2E green; dual full chat E2E flaky historically |
| **B2** Split → fresh session on new panel | **Partial** | Pure reducers + lifecycle; natural drag split E2E not fully trusted |
| **B3** Merge both_on_survivor | **Partial** | Unit lifecycle + coordinator; real merge E2E limited |
| **B4** Foreign row disabled / English block | **Partial → good E2E** | `window-isolation` E2E (foreign rows) was green in core suite |
| **B5** Panel close stops runs; in-panel switch keeps others | **Partial** | Product code intent + lazy workers; not full dual-run proof |
| **B6** Reopen panel hydrates IDB body | **Partial** | Unit re-init body restore; depends on durable IDB (now no memory fail-open) |
| **B7** Merge while open rebinds acting | **Partial** | `rebindWindow` path exists; natural merge E2E weak |
| **B8** Second window Settings/shell fast | **Mostly done** | Settings early/optimistic; second-window-boot ~sub-second–seconds after IDB fix; was blocked by IDB storm |
| **B9** No full OPFS/skills on cold chat boot | **Mostly done** | Lazy skills/files + unit boot-intent tests |
| **B10** `E_TAB_NOT_OWNED` cross-window | **Done (extension-js)** | web-js `session-isolation` 47/47; not Browsergent host |

---

## 3. Phase scorecard (refactor doc)

| Phase | Goal | Status |
|-------|------|--------|
| **0** Contract freeze | Docs, offscreen legacy | **Partial** — `WINDOW_ISOLATION_REFACTOR.md` exists; checkboxes not all closed in README |
| **1** Window spine | Pure reducers, SW fanout, WindowContext, boot order | **Mostly done** — `session-index-lifecycle`, coordinator, WCC, settings-first |
| **2** Session index vs body services | Formal services, idle migrate, CAS | **Not done** as named services; meta-first paths exist ad hoc |
| **3** Lazy agent / acting | Worker + extjs on first need | **Mostly done** |
| **4** Lazy skills/files | Intent-only OPFS | **Mostly done** |
| **5** Real Chrome split/merge gate | Manual + solid dual-window agent E2E | **Open / flaky** |

---

## 4. Side quest that blocked E2E (done)

This is **why we “jumped out”** of pure isolation E2E:

| Item | Status |
|------|--------|
| Running ↔ `reloadSessionList` feedback loop (10k–30k `__meta` ops) | **Fixed** (`app.tsx`) |
| Memory fail-open boot (fake durable) | **Removed** |
| Unified IDB path + serial queue | **Done** (`IndexedDBStorage` + `openPanelStorage`) |
| TDD locks for queue / open / SessionController | **Done** (unit) |
| Dual-window IDB bench after fix | **Green** (ms-level opens) |
| Docs in `talk/` | **Done** |

**Lesson for next agent:** multi-window “IDB broken” was mostly **our storm**, not “Chrome forbids dual IDB.”

---

## 5. Test surface audit

### Green or recently green (not a full CI matrix)

| Suite | Role | Last known |
|-------|------|------------|
| Unit window/session/lifecycle/open-panel | Spine | Green |
| `second-window-boot` | B8 shell | Green (~0.3–1s after fixes) |
| Core E2E subset (smoke, settings, window-isolation) | Partial product | Was green earlier in session |
| extension-js session-isolation | B10 | 47/47 |
| `_bench-idb-multiwindow` | IDB health | Green after loop fix |

### Red / flaky / not re-run

| Suite | Role | Status |
|-------|------|--------|
| `two-window-sessions` | Dual mock LLM independent chats | Historically flaky/timeout; rewritten helpers; **not re-certified after latest IDB queue** |
| `window-lifecycle*` / `window-merge-headless` | B2/B3/B7 | Present; **not full re-run this session** |
| **Full Playwright 100+ tests** | Regression | **Never claimed green after refactor** |
| Real Chrome manual drag split/merge | B2/B3/B7 | Checklist only |

---

## 6. Code map (where work lives)

| Area | Key paths |
|------|-----------|
| Pure merge/close/create | `src/controllers/session-index-lifecycle.ts` |
| Session attach / meta | `src/controllers/session-controller.ts` |
| Panel window bind | `src/sidepanel/window-context-controller.ts` |
| Boot | `src/sidepanel/components/use-app-init.ts` + `open-panel-storage.ts` |
| Running loop fix | `src/sidepanel/app.tsx` |
| SW lifecycle | `src/background/window-session-coordinator.ts`, `index.ts` |
| IDB queue | `src/storage/indexeddb-storage.ts` |
| Talk notes | `talk/2026-07-09-*.md` |

Working tree: large uncommitted window-isolation + IDB work on `main` (ahead of origin).

---

## 7. Explicitly NOT done (next work candidates)

1. **Re-run and green `two-window-sessions` + window-lifecycle E2E** after IDB/loop fixes  
2. **Full Playwright suite** (or documented exclude list) as regression gate  
3. **Phase 2 formalization** — SessionIndexService / SessionBodyService, CAS on panel meta  
4. **SW as single IDB writer** (optional architecture; not required after storm fix)  
5. **Real Chrome manual B2/B3/B7** drag/merge checklist filled with evidence  
6. **Cleanup** diag tests (`_diag-*`) if not wanted in tree; commit strategy  

---

## 8. Recommended order if we resume (do not do all at once)

```text
1. Audit-only freeze (this doc) ← you are here
2. Re-run targeted E2E: second-window-boot, window-isolation, two-window-sessions
3. Fix only failures that break B1/B4/B8
4. Then lifecycle E2E (B2/B3/B7)
5. Only then Phase 2 service extraction
```

---

## 9. One sentence for the next agent

**Window isolation host spine and multi-window IDB abuse are largely fixed and unit-gated; product acceptance still needs re-certified multi-window Playwright (especially dual agent runs and natural merge/split), Phase 2 formal session services, and a full E2E audit — do not claim end-to-end done.**
