# Claim closed / orphan session (C1 + R1)

**Date:** 2026-07-10  
**Product choice:** explicit claim (C), not automatic sole-survivor merge (B).

## Contract

| ID | Rule |
|----|------|
| **C1** | Only sessions whose Chrome window is **closed or gone** may be claimed. Live foreign windows stay blocked. |
| **R1** | Claim rebinds **same session id** (`windowId` → this panel, lifecycle `background`). |
| **UX** | Affordance **Open in this window**; claimable row click = claim; after claim/switch → **chat** tab. |
| **Orphan** | If lifecycle close never arrives, `chrome.windows.getAll` live set still marks gone windows claimable. Live membership **vetoes** stale `closedWindowIds`. |

## Code

- `SessionController.claimClosedSession` → `ClaimClosedSessionResult`
- `isClaimableClosedSession` / `listLiveChromeWindowIds` in `session-window-utils.ts`
- Session panel `data-session-claimable` + `claim-closed-session` button

## Tests

```bash
npm run test:unit -- tests/unit/window-session-binding.spec.ts tests/unit/session-window-utils.spec.ts
npx playwright test tests/claim-closed-session.spec.ts --workers=1
```

- Unit: rebind same id, refuse live foreign, refuse stale closed when still live, orphan without close event.
- E2E: broadcast close path + orphan path (close window only, no lifecycle broadcast).
