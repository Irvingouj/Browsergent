# Talk: TDD execution — durable IDB + queue

**Plan approved:** IDB storage queue + no memory fail-open  
**Test focus:** unit/integration (`StorageBackend`, `SessionController`)

## Slices completed

| Slice | Behavior | Test | Result |
|-------|----------|------|--------|
| 0 B1 | Concurrent sets → last write wins | `indexeddb-storage.spec.ts` serial queue | green |
| 1 B2 | Queue continues after failed get-before-init | same file | green |
| 2–3 B3/B4/B5 | `openPanelStorage` durable + hard fail | `open-panel-storage.spec.ts` | green |
| 4 B6 | SessionController via openPanelStorage | same file | green |
| 5 | Boot uses `openPanelStorage()` | `use-app-init.ts` | wired |

## Public API

```ts
// src/storage/open-panel-storage.ts
export async function openPanelStorage(): Promise<StorageBackend>
// always IndexedDBStorage + init + migrate; throws on failure; never MemoryStorage
```

## Gates run

```bash
npx vitest run tests/unit/indexeddb-storage.spec.ts \
  tests/unit/open-panel-storage.spec.ts \
  tests/unit/session-controller-indexeddb.spec.ts \
  tests/unit/migrate.spec.ts
# 38 passed
npm run typecheck && npm run build
```
