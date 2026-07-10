# Talk: IDB unified queue + audit (follow-up)

**Date:** 2026-07-09  
**Depends on:** `talk/2026-07-09-indexeddb-multiwindow.md` (feedback-loop root cause)

---

## What the user asked

1. **Undo** the MemoryStorage “stash” / fail-open boot path  
2. **Unify** IndexedDB access through a single throttler/queue  
3. **Audit** the whole system  
4. Report findings  

---

## Audit: who touches IndexedDB?

### Production (`src/`)

| Location | Access | Notes |
|----------|--------|--------|
| **`IndexedDBStorage` only** | `indexedDB.open` + all txs | **Sole production owner of raw IDB API** |
| `SessionController` | via `StorageBackend` | get/set/remove/getAllKeys on `sessions` |
| `SettingsController` | via `StorageBackend` | get/set on `settings` |
| `migrateFromChromeStorage` | via `StorageBackend` | get `__migrated`, optional sets |
| `use-app-init` | constructs `IndexedDBStorage`, calls `init` + migrate | only construction site in app |

**Not IndexedDB:**

| Location | What |
|----------|------|
| `chrome.storage.session` | lifecycle fanout, diag ring, `panelReady` |
| `chrome.storage.local` | one-shot migrate source only |
| OPFS / extension-js | files, skills, acting — **no IDB** |
| SW `background/diag.ts` | `chrome.storage.session` only |

### Tests

| Location | Access |
|----------|--------|
| Unit tests | `MemoryStorage` (in-memory fake) or `IndexedDBStorage` + fake-indexeddb |
| E2E helpers / window specs | raw `indexedDB.open("browsergent")` for **assertions only** (not app path) |

**Conclusion:** Production app path already had a single interface (`StorageBackend`). The gap was (1) concurrent txs inside one document, (2) MemoryStorage fail-open forking durability.

---

## What we changed

### 1. Serial queue inside `IndexedDBStorage` (throttler)

Every public method (`init`, `get`, `set`, `remove`, `getAll`, `getAllKeys`, `clear`, `close`) goes through:

```text
enqueue(op) → FIFO chain → one IDB op at a time per panel document
```

- Concurrent callers still get promises; they **serialize**  
- Failures reject the caller but **do not stall** the queue  
- Logging keeps `queueDepth` + `[idb-timing]`  

This is the unified throttler for **all real IDB work** in the panel.

### 2. Removed MemoryStorage boot stash

`use-app-init` no longer:

- races open vs 1.5s fast-gate  
- falls back to `MemoryStorage`  
- late-ready / “reload for durable” dance  

Now:

```text
await IndexedDBStorage.init()
await migrateFromChromeStorage()
→ idb ok → continue boot
→ on hard failure: E_BOOT_IDB banner, stop boot (no fake durable store)
```

`MemoryStorage` remains for **unit tests only**.

### 3. Still required (from prior fix)

Feedback loop fix in `app.tsx` stays:

- running broadcast → **memory badge only**, not full IDB reload  
- single-flight `reloadSessionList`  

Queue alone does not fix 30k concurrent **logical** reloads; it only serializes them (would still be slow). Loop break + queue is the pair.

---

## Architecture after this change

```text
  SessionController ──┐
  SettingsController ─┼── StorageBackend interface
  migrate ────────────┘
            │
            ▼
     IndexedDBStorage
            │
            ▼
      serial enqueue  (NEW — required path)
            │
            ▼
      indexedDB open / transaction
```

No second production path to raw IDB.

---

## What “queue” does **not** do

| Out of scope | Why |
|--------------|-----|
| Cross-window single connection | Each panel document still has its own `IndexedDBStorage` instance + queue; shared origin DB is still multi-connection |
| SW StorageActor | Discussed; not implemented this pass |
| Ban test raw `indexedDB.open` | E2E diagnostics may open directly; app never does |

---

## Verification

```bash
npx vitest run tests/unit/indexeddb-storage.spec.ts tests/unit/session-controller-indexeddb.spec.ts
# includes concurrent write-order queue test

npm run build
npx playwright test tests/_bench-idb-multiwindow.spec.ts tests/second-window-boot.spec.ts --workers=1
```

Expect: unit pass; dual-window bench still ms-level if feedback loop stays fixed.

---

## Rules for next agent

1. **Do not** add `new MemoryStorage()` on the production boot path.  
2. **Do not** call `indexedDB.*` outside `IndexedDBStorage` in `src/`.  
3. Controllers must keep using `StorageBackend` only.  
4. If multi-window “IDB death” returns, check **op counts** (`[idb-timing] op_start`) before blaming the platform.  
5. Cross-document single-writer (SW) is a separate upgrade if needed later.

---

## One-line summary

**Audit: only `IndexedDBStorage` hits real IDB in production. We removed the memory fail-open boot path and forced every IDB op through a per-document serial queue; durability is unified again, concurrent storm is throttled at the storage boundary.**
