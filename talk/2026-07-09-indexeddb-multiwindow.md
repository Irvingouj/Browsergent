# Talk: IndexedDB multi-window investigation (2026-07-09)

**Audience:** next agent / human continuing Browsergent multi-window work  
**Repo:** `~/code/Browsergent`  
**Related plan:** `WINDOW_ISOLATION_REFACTOR.md`  
**Status:** Root cause of “multi-window IDB is broken” largely identified as **our feedback loop**, not IndexedDB forbidding multi-window. Partial host-layer window isolation still in flight; dual-LLM E2E may still be flaky for other reasons.

---

## 1. What problem we were chasing

Symptoms during window-isolation work:

- Second sidepanel boot hung or took tens of seconds
- Console: `SessionController.init timeout`, later `E_BOOT_IDB` / fast-gate timeout
- Playwright multi-window tests timed out (CDP `page.evaluate` freezes on second `chrome-extension://` page)
- Easy narrative: “IndexedDB can’t handle multi-window”

User pushback was correct: **empty `open` / skip-migrate should not take seconds of real disk work** — something else was wrong.

---

## 2. What we tried (chronological)

### 2.1 Host boot / isolation (earlier in the goal)

- Meta-first sessions, settings-first B8 shell, lazy agent/extjs
- `WindowContextController.init`: `bindPanelWindow`, `resolveOrCreateForWindow`, ephemeral + `persistEphemeralSession(sameId)`
- Playwright: DOM clicks, no CDP trace, `?windowId=` for second panel
- Non-blocking / fail-open IDB boot (1.5s SW-timer fast-gate → MemoryStorage + banner)

### 2.2 “Is it really IndexedDB?” instrumentation

| Artifact | Role |
|----------|------|
| `src/storage/indexeddb-storage.ts` | `[idb-timing]` on **every** op: open/get/set/remove/getAll/getAllKeys/clear; `op_slow` if ≥50ms |
| `src/storage/migrate.ts` | migrate start/skip/done timings |
| `src/sidepanel/components/use-app-init.ts` | boot openIdbDurable phase timings; memory fail-open; `panelReady:{windowId}` in `chrome.storage.session` |
| `tests/_diag-idb-timing.spec.ts` | harvest boot timings A vs B |
| `tests/_bench-idb-multiwindow.spec.ts` | pure open/get/put + dual-window + concurrent open |

### 2.3 Misleading early numbers (before loop fix)

On panel B during boot under load (with A already open and storming):

- `onsuccess openMs` ≈ **2474 ms**
- migrate “already done” `get(__migrated)` ≈ **53626 ms**
- total ≈ **56 s** → fast-gate 1.5s fired → memory + late-ready banner

Interpretation **before** finding the storm: multi-window IDB callbacks are evil.  
Interpretation **after** finding the storm: B was queued behind **tens of thousands** of A’s concurrent ops.

### 2.4 The smoking gun (logs)

With full op logging, **panel A alone** during a failed multi-window run:

| Metric | Approx |
|--------|--------|
| `op_start` count | **~32,000** |
| `op_done` count | **~11,000** |
| `get(sessions, __meta)` starts | **~22,000** |
| Per completed op | usually **1–5 ms** |

So IDB was not “doing TB of work” — **our app was flooding it**.

---

## 3. Root cause: recursive session-list / running feedback loop

### 3.1 Intended design (each piece looked reasonable)

1. `reloadSessionList()` — keep session drawer accurate (refreshMeta + listSessions)
2. `syncLocalRunningToCoordinator()` — advertise local runs + persist `runningSessionsByWindow` in `__meta`
3. SW broadcast of global running — other windows show Running badge
4. `setGlobalRunningBySession` — UI state from broadcast
5. `useEffect([globalRunningBySession])` → `reloadSessionList()` again

### 3.2 Actual cycle

```text
reloadSessionList
  → refreshMeta / listSessions / persistMeta (__meta write)
  → reportRunningSessions → SW fanout
  → setGlobalRunningBySession({ ... })   // always new object
  → useEffect fires
  → reloadSessionList again
  → concurrent void reloads (no single-flight)
  → 10k–30k IDB ops
```

Also: `reloadSessionList` depended on `globalRunningBySession` in `useCallback` deps → identity churn → more effects.

### 3.3 Why multi-window made it obvious

- Single panel: fewer broadcasts, sometimes “fine”
- Two panels: write → broadcast → both reload → both write → storm
- Second panel open/get sits behind the queue → looks like “IDB multi-window broken”

**Root cause is our dataflow, not “IndexedDB forbids multi-window.”**

---

## 4. How we fixed it

### 4.1 Break the loop (`src/sidepanel/app.tsx`)

1. **Global running updates only patch in-memory list**  
   - Update `sessions[].running` + local running ids  
   - **Do not** call full `refreshMeta` + `listSessions` on every broadcast

2. **`reloadSessionList` single-flight**  
   - Concurrent callers await the same in-flight promise

3. **Shallow-compare** `bySession` before `setGlobalRunningBySession`  
   - Identical content → keep previous object → no effect re-run

4. **Full IDB reload only when**  
   - shell `initialized`, or session panel opens, or explicit lifecycle handlers still call reload

### 4.2 Supporting pieces (still useful)

- IDB op timing logs kept for future debugging  
- `panelReady` marker for E2E when CDP evaluate freezes  
- Second-window helpers: anti-throttle Chrome flags, focus, storage-based ready poll  
- Fail-open IDB still exists (1.5s gate) but after loop fix, dual-window often gets **`idb: ok`** without hitting it

---

## 5. Benchmarks after the fix

Command:

```bash
cd ~/code/Browsergent && npm run build && \
  npx playwright test tests/_bench-idb-multiwindow.spec.ts --workers=1
```

**Result (one clean run after loop fix):**

| Measurement | Value |
|-------------|--------|
| Whole dual-window bench wall time | **~7 s** |
| Boot open A | **2 ms** |
| `E_BOOT_IDB` count | **0** |
| Second window `panelReady` | **`idb: "ok"`** |
| Pure open app DB A alone | **1–4 ms** |
| Pure open app DB B with both open | **0–1 ms** |
| Pure get/put both panels | **0–1 ms** |
| Concurrent A+B open | **1 ms / 0 ms** |
| Total `[idb-timing]` lines harvested | **~64** (not 30k) |
| `op_slow` (≥50ms) | **0** |

Conclusion for next agent:

> Multi-window IndexedDB **works at millisecond scale** once we stop flooding it.  
> Do not re-introduce “on any running broadcast, full IDB reload + persistMeta.”

---

## 6. Architecture notes (for later, not done)

### What IDB is in this repo

- **Only Browsergent sidepanel** uses `IndexedDBStorage` (`browsergent` DB v2)
- **extension-js does not use IndexedDB** (OPFS / chrome APIs elsewhere)
- Stores: `settings`, `sessions`, `history`, `runs`
- `chrome.storage.session` = lifecycle fanout, diag ring, `panelReady` — **not** IDB

### Master/child storage (discussed, not implemented)

User idea: one writer, others RPC. **Legit.**

- Prefer **existing MV3 background service worker** (`src/background/index.ts`) as owner, **not** offscreen, **not** “main sidepanel”
- Offscreen was only mentioned as a rejected alternative
- SW can sleep; design is wake-on-message + re-open connection in SW only
- **Not required** for basic multi-window health after the loop fix; still a good hardening path

### Fail-open IDB (implemented)

- `use-app-init`: race open+migrate vs ~1.5s SW delay  
- Timeout → MemoryStorage + `E_BOOT_IDB` banner; background open may late-ready  
- Late-ready currently does **not** hot-swap controllers (reload panel for durable)  
- After loop fix this path is less often hit in dual-window boot

---

## 7. Files touched (this investigation + fix)

| Path | What |
|------|------|
| `src/sidepanel/app.tsx` | **Break running↔reload feedback loop**; single-flight reload |
| `src/storage/indexeddb-storage.ts` | Full op timing + ring helpers |
| `src/storage/migrate.ts` | Migrate phase timings |
| `src/sidepanel/components/use-app-init.ts` | Non-blocking IDB boot, `panelReady`, memory sync path |
| `tests/helpers.ts` | Second window helpers, `onPage`, nav race harden |
| `tests/_bench-idb-multiwindow.spec.ts` | Dual-window IDB benchmark |
| `tests/_diag-idb-timing.spec.ts` | Earlier timing harvest |
| `tests/second-window-boot.spec.ts` | Read windowA before open B; storage ready |

---

## 8. What is still open (not solved by this talk)

- Window-isolation host refactor may still have **other** gaps (dual mock-LLM E2E, merge/split natural drag, etc.)
- Playwright **CDP freeze** on two extension pages is still real — prefer `panelReady` / focus / avoid dual evaluate
- Hot-swap MemoryStorage → IDB after late open **not** implemented
- SW StorageActor **not** implemented
- Full old E2E suite not re-proven after all changes
- Consider **removing or raising** 1.5s IDB fast-gate now that the storm is fixed (optional)

---

## 9. Rules for the next agent

1. **Never** wire “global running changed” → full IDB `reloadSessionList` + `persistMeta`.  
2. Before blaming IndexedDB multi-window, run `_bench-idb-multiwindow` and count `[idb-timing] op_start` for `__meta`.  
3. If op counts explode, search for effect loops (`useEffect` + broadcast + setState new object).  
4. extension-js is not the IDB culprit.  
5. Prefer evidence (`[idb-timing]`, bench JSON) over folklore.

---

## 10. One-line summary

**We almost blamed IndexedDB for multi-window failure; benchmarks showed our session-list/running feedback loop was issuing tens of thousands of concurrent `__meta` reads/writes. Breaking that loop restored multi-window IDB to millisecond performance.**
