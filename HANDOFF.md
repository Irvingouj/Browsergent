# Browsergent — Window Session Isolation Handoff

**Date:** 2026-07-10  
**Version:** 0.5.7  
**Status:** Mock Playwright green path + claim-closed E2E. Real multi-window Chrome still needs a light manual smoke after reload.  
**Partner repo:** `../web-js` (extension-js linked via `node_modules/@pi-oxide/extension-js`)  
**Latest session notes:** [`talk/2026-07-10-e2e-green-and-status.md`](./talk/2026-07-10-e2e-green-and-status.md) · [`talk/2026-07-10-split-window-audit.md`](./talk/2026-07-10-split-window-audit.md) · [`talk/2026-07-10-claim-closed-session.md`](./talk/2026-07-10-claim-closed-session.md)

---

## Crash diagnosis (30 seconds)

When the extension “crashes” or the second window dies:

1. **`chrome://extensions` → Browsergent → Errors** — look for lines starting with `[browsergent][error]`.
2. **Service worker console** — click “Service worker”, filter `browsergent`.
3. **Side panel console** — right-click panel → Inspect; filter `browsergent` or `extension-js`.
4. **In-panel banner** — red host-error strip shows last `code` + message; **Copy logs** dumps memory + SW diag rings.
5. **`window.__BROWSERGENT_DIAG__`** in panel console — `.memory`, `.swRing`, `.snapshot()`.
6. **Boot health attrs** on root: `data-boot-idb`, `data-boot-extjs`, `data-boot-worker`, `data-boot-sw`.

SW diag ring key: `chrome.storage.session` → `bgDiagRing` (survives SW restart for one read after panel reopen).

---

## 1. What we were building

Per-window agent sessions (VSCode-style): each Chrome window owns its chat sessions; cross-window rows are visible but not openable; merge/split/close lifecycle rebinds sessions.

### Locked product rules (2026-07-09, supersedes older “panel-close headless” plans)

| Term | Meaning |
|------|---------|
| **Foreground session** | The session currently shown in the chat UI of an open side panel. |
| **Background session (in-panel)** | Another session **in the same open panel** that may still have a worker/run. N concurrent runs are allowed; only one is on the chat frontend. |
| **Close side panel** | **By design, all runs in that panel stop.** Session *data* may remain in IDB; live workers do not outlive the panel. We do **not** want keep-running-after-panel-close. |

Full design: [`WINDOW_SESSION_ISOLATION_PLAN.md`](./WINDOW_SESSION_ISOLATION_PLAN.md) (see superseding note at top).

### Behavior contract (test IDs)

| ID | Status | Notes |
|----|--------|-------|
| B1 | ✅ | Two windows → independent sessions |
| B2 | ✅ mock / ⚠️ real drag | `window-split-lifecycle.spec.ts` (`broadcastWindowSplit` + attach); real **drag tab** still manual §6 |
| B3 | ✅ mock / ⚠️ real | Merge auto-rebind when lifecycle fires; if only close/orphan, user **Open in this window** (C1 claim, same session id) — `tests/claim-closed-session.spec.ts` |
| B4 / B4b | ✅ | Live foreign rows blocked; closed/orphan rows claimable (not steal from live windows) |
| B5 | ✅ **by design** | In-panel: switch session → prior run can keep going **while panel open**. Close panel → runs **stop**. |
| B6 | ⚠️ unit ✅ | Reopen panel: same `sessionId` + messages (`window-context-controller` unit); no dedicated close→reopen E2E |
| B7 | ✅ mock / ⚠️ real | `window-merge-headless` + lifecycle merge; natural tab-merge E2E **fixme** (headless); real Chrome §6 |

### 2026-07-10 fixes (summary)

- **Relay:** remote run events are badge-only unless session is local foreground; no triple chat/IDB apply.
- **Ephemeral boot:** persist claimed session id instead of minting a second one; `saveForSession` upserts.
- **IDB:** durable-only open + serial queue (no Memory fail-open).
- **Post-tool chat:** `STATUS_MAP.completed → running`; activeRunId always paints; optimistic Run UX.
- **Claim closed session (C1/R1):** explicit **Open in this window** for closed/orphan sessions (live `getAll` veto); lands on chat; no sole-survivor auto-merge.
- **Todo next:** lease hang on `page.fill`/`page.click` completion; real dual-window smoke; natural tab-merge still fixme.

---

## 2. Current architecture (important)

### Run hosting: `local` (panel document) — intentional

`RunSupervisor` uses **`hosting: "local"`** in `use-app-init.ts`. Workers run inside the sidepanel document that started the run. **Closing the panel kills those workers — product intent.**

```
Panel open
  ├─ Foreground session: chat UI + optional active run
  └─ Background session(s): N concurrent runs in same panel doc (not shown in chat)

Panel closes
  └─ All local workers terminate — correct. No offscreen survival.
```

### “Offscreen” code (legacy / unused)

Older plans explored offscreen continuation after panel close. **That goal is cancelled.** Files may still exist but must not be treated as a shipping requirement:

| File | Notes |
|------|--------|
| `public/headless-boot.js`, `headless.html` | Legacy bootstrap — not product path |
| `src/protocol/offscreen-run.ts` | Protocol leftovers; relay types may still be used for cross-panel events |
| `src/controllers/offscreen-proxy-bridge.ts` | Unused for production hosting |

### Cross-panel run relay (active while panels open)

**2026-07-10:** remote panels must **not** append foreign chat or dual-sink IDB. They only track running badges unless the session is their foreground (merge-adopt). Origin ignores late relays while a local bridge still exists.

While a run lives on panel B **and panel B is still open**, events can fan out so panel A can observe running state for merge UX:

1. Panel B `onSessionRunRelay` → `chrome.runtime.sendMessage`
2. Background stores `runRelay:{sessionId}` in `chrome.storage.session`
3. Background fanouts to other panels (with loop guard — see §3)
4. Survivor panels `applyRemoteRunEvent` + IDB persist via `SessionRunSink`

If panel B is closed, that run is gone — no survival path.

---

## 3. Known crashes & fixes (2026-07-09)

### Fix A — Service worker registration failed (status 15)

**Symptom:** Side panel won't open; extension card shows "Service worker registration failed. Status code: 15".

**Cause:** Vite emits `background.js` as ES module (`import` from `chunks/window-lifecycle-*.js`) but manifest lacked `"type": "module"`.

**Fix:** `public/manifest.json`:
```json
"background": {
  "service_worker": "background.js",
  "type": "module"
}
```

**After every build:** Reload extension at `chrome://extensions`. Verify service worker link is active (no registration error).

### Fix B — Service worker spin / crash on relay

**Symptom:** Extension crashes when agent runs, or sporadically on tab activity.

**Cause:** `background/index.ts` re-broadcast `sessionRunRelay` via `chrome.runtime.sendMessage`, which the SW listener received again → infinite loop.

**Fix:** Only fan out when `sender.url` includes `/sidepanel.html`. Storage write always happens; SW echo is ignored.

### Fix C — Spurious lifecycle on unrelated tab moves

**Symptom:** Crash or weird session state when opening new tabs/windows.

**Cause:** `tabs.onDetached` / `windows.onRemoved` fired for windows that never had a Browsergent panel, triggering false merge/close.

**Fix:** `window-session-coordinator.ts`:
- Track detach only if `registry.hasPanel(oldWindowId)`
- Emit removal only if panel existed or `lifecycleTracker.hasMergeTarget(id)`

### Fix D — Background tab navigation spam

**Symptom:** Heavy skill auto-load when opening background tabs.

**Fix:** `use-app-init.ts` — `webNavigation.onCommitted` only updates `UrlTracker` for the **active tab** in the current window.

### Still fragile

- Run Playwright with `--workers=1` for multi-window (parallel load can timeout `data-worker-ready`)
- No real-LLM smoke run completed for this workstream
- **Natural** drag merge/split in headless Chromium: `tabs.onDetached`/`onAttached` often missing — use broadcast helpers or manual Chrome (split audit)
- Relay: `isLocalWorkerHost` + remote badge-only shipped; rare ordering edge cases possible

---

## 4. Key files map

### Background / lifecycle
- `src/background/index.ts` — SW entry, relay fanout, sidepanel open on action click
- `src/background/window-session-coordinator.ts` — panel registry, lifecycle listeners
- `src/background/window-lifecycle-tracker.ts` — pure split/merge/close correlation
- `src/protocol/window-lifecycle.ts` — message types
- `src/sidepanel/window-context-controller.ts` — panel-side lifecycle subscription

### Session / runs
- `src/controllers/session-controller.ts` — IDB sessions, merge/close, `panelActiveSession` meta
- `src/controllers/run-supervisor.ts` — worker bridges, headless detach, relay apply
- `src/controllers/session-run-registry.ts` — per-session run attachment
- `src/controllers/session-run-sink.ts` — IDB persistence debounce
- `src/sidepanel/app.tsx` — merge handler, session switch, lifecycle effects

### Tests
- `tests/window-split-lifecycle.spec.ts` — **B2** split broadcast + independent sessions
- `tests/window-lifecycle.spec.ts` — B3–B4
- `tests/second-window-boot.spec.ts` — B8 second shell
- `tests/window-merge-headless.spec.ts` — **B7**
- `tests/window-lifecycle-natural.spec.ts` — natural merge **fixme**; running sync
- `talk/2026-07-10-split-window-audit.md` — B2 gaps
- `tests/background-session.spec.ts` — headless switch/subscribe
- `tests/two-window-sessions.spec.ts`, `tests/window-isolation.spec.ts`
- `tests/unit/window-*.spec.ts`, `tests/unit/background.spec.ts`

---

## 5. Build & test

```bash
cd /Users/oujunyi/code/Browsergent

# Build (syncs manifest version, typecheck, vite)
npm run build

# Unit (expect ~1118/1120; 2 known failures in background + extension-js-client as of 2026-07-10)
npm run test:unit

# Mock E2E — run serially if flaky
npx playwright test tests/window-merge-headless.spec.ts --workers=1
npx playwright test tests/window-lifecycle.spec.ts tests/background-session.spec.ts --workers=1

# Real LLM (NOT run for this workstream — do before shipping)
npm run smoke
npx playwright test tests/real-deepseek.spec.ts
```

**Load in Chrome:** `chrome://extensions` → Load unpacked → `dist/`  
**Requires:** `../web-js` built (`npm run build` in web-js) so symlinked `@pi-oxide/extension-js` resolves.

---

## 6. Manual smoke checklist (real Chrome)

1. Build + reload extension; confirm **no SW registration error**
2. Open side panel in window A — UI loads, `data-initialized="true"`
3. Open several new tabs (Ctrl+T) — **panel must not crash**
4. **Split:** drag a tab out of window A into a **new** window → open side panel there — **empty chat**, A unchanged. (Or: second window + panel — independent session; mock E2E path.)
5. Run task in B, switch session (in-panel background) — running badge on prior session; panel still open
6. Merge B into A (drag tab / close B's last tab into A) **while B’s panel still open**:
   - Run on B may complete if panel B still open
   - A session list shows merged row with survivor window badge
   - Click merged row — messages hydrate
7. Close B's panel mid-run — **expect run to stop** (by design; do not treat as a bug)

---

## 7. What's left (priority order)

### P0 — Stability
- [ ] Confirm Fixes A–D in real Chrome after reload (user-reported crashes)
- [ ] Add E2E regression: SW stays registered; open 3 tabs with panel open, no console errors
- [x] Relay double-apply on survivor/origin — `isLocalWorkerHost` + remote badge-only (2026-07-10)
- [x] **B2 split lifecycle E2E** — `broadcastWindowSplit` + `window-split-lifecycle.spec.ts`
- [ ] **B2 real Chrome:** drag tab → new window → first panel (§6)
- [ ] Fix 2 unit failures: `background.spec.ts`, `extension-js-client.spec.ts`

### P1 — Multi-window while panels open
- [x] B7 merge with panels open — mock E2E (`window-merge-headless`, lifecycle merge)
- [ ] Natural merge/split E2E when Chromium emits detach/attach (or headed Chrome)
- [ ] In-panel multi-session concurrent runs — spot-check foreground vs background UI

### P2 — Validation
- [ ] `npm run smoke` with DeepSeek key
- [ ] Optional cleanup: remove or quarantine dead offscreen host code (not required for product)

### Explicitly out of scope (locked)
- [x] ~~Offscreen / keep agent running after side panel close~~ — **rejected**

### P3 — Cleanup
- [ ] Remove or quarantine dead offscreen TS / `headless-boot.js` (optional; product does not use panel-close survival)
- [x] Update `WINDOW_SESSION_ISOLATION_PLAN.md` — Slice 6–7 cancelled; B5 redefined

---

## 8. Debugging guide

| Symptom | Check |
|---------|-------|
| Side panel won't open | Extension card → Service worker errors; confirm `type: "module"` in `dist/manifest.json` |
| Crash on new tab | SW console for relay loop; lifecycle `windowLifecycle` spam in `chrome.storage.session` |
| Merge session not visible | IDB `browsergent` → `sessions` store; `__meta.panelActiveSession`; survivor `applyWindowMerge` |
| Run stops on panel close | **By design** — workers live in the panel; we do not keep runs after panel close |
| Run stops on merge | Expected if panel B closes during merge; if both panels stay open, check `reboundRunningSessionIds` |
| Cross-window tool error | extension-js `E_TAB_NOT_OWNED` — see web-js handoff |

**SW console:** `chrome://extensions` → Browsergent → "Service worker" link  
**Panel console:** Right-click side panel → Inspect

---

## 9. Dependency on web-js

Browsergent consumes extension-js via symlink:

```
node_modules/@pi-oxide/extension-js → ../web-js/crates/extension-js/js/pkg
```

Browsergent calls:
- `ExtensionSession.init({ windowId })` on panel open
- `rebindWindow(survivorId)` on merge (survivor panel only)

See [`../web-js/HANDOFF.md`](../web-js/HANDOFF.md) for extension-js window isolation details.

---

## 10. Session meta quick reference

```typescript
// IndexedDB store: "browsergent" / "sessions"
interface SessionMeta {
  panelActiveSession: Record<string, string>;  // windowId → active sessionId
  closedWindowIds?: number[];
  runningSessionsByWindow?: Record<string, string[]>;
}
```

Each `SessionData` has `windowId`, `lifecycle: "foreground" | "background"`.

---

*Last updated after B7 mock E2E fix + crash fixes (manifest module, relay loop, lifecycle guards).*