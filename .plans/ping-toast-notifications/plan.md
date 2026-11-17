# Live Ping Toast Notifications (> $100)

## Problem
The dashboard only fetches `/api/ping` while the **Ping** tab is active (`client/src/pages/Ping.tsx:36-56`), so high-value wallet activity (`>$100`) goes unnoticed when viewing other tabs or without manually watching the feed.

## Solution
- Poll `/api/ping` from `client/src/App.tsx` across all tabs on the existing 30-second `refreshTick` cycle (and on manual refresh).
- Build a composite deduplication key per alert (`${ts}:${kind}:${mint}:${wallet ?? ''}:${detail?.usd ?? ''}`) and hydrate seen keys silently on the first successful `/api/ping` response so historical alerts do not flood the screen.
- On subsequent polls, enqueue any unseen alert where `typeof detail?.usd === 'number' && detail.usd > 100` (covering `buy`, `sell`, `exit_wallet`, and `exit_deployer`).
- Render a custom Sonner-style `PingToaster` component fixed at `bottom-4 right-4 z-50` matching the dark-amber glass theme (`#211c16`, `#e59a28`, `#f4ede2`), capped at 4 visible toasts, auto-dismissing after 6 seconds, with a close button and click-to-open-Ping-tab navigation.

## Files
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/App.tsx` — Poll `/api/ping` on `refreshTick`, track seen alert keys after silent initial hydration, manage toast queue/auto-dismiss, and render `PingToaster`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/components/PingToaster.tsx` — New bottom-right Sonner-style toast stack component displaying alert kind, token symbol/short mint, wallet label/short address, formatted USD amount, close button, and click-to-navigate action.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/__tests__/ui.test.tsx` — Add unit/integration tests covering silent hydration, `> $100` threshold, `<= $100` / non-USD filtering, deduplication, click navigation to `Ping` tab, and dismiss/auto-timeout.

## Acceptance criteria
1. Opening the dashboard does not show toasts for historical `>$100` alerts already in `/api/ping` (checked by `ui.test.tsx`).
2. When a subsequent `/api/ping` poll returns a new `buy`, `sell`, `exit_wallet`, or `exit_deployer` alert with `detail.usd > 100`, a toast appears in the bottom-right corner regardless of the active tab (checked by `ui.test.tsx`).
3. Alerts with `detail.usd <= 100` or without `detail.usd` (e.g. `consensus`, `exit_liquidity`) do not trigger a toast (checked by `ui.test.tsx`).
4. Clicking a toast navigates to the `Ping` tab and dismisses the toast; clicking its close button dismisses it without changing tabs; toasts auto-dismiss after 6 seconds (checked by `ui.test.tsx`).
5. `cd client && npm test` and `cd client && npm run build` pass cleanly.

## Risks
- **Duplicate toasts on identical timestamps/values:** Mitigated by keying on `ts`, `kind`, `mint`, `wallet`, and `detail.usd` (and `detail.sig` if present), plus capping the seen set or keeping recent keys in memory.
- **Polling overlap / unmount leaks:** Use an `active` cancellation flag in the `useEffect` fetch and clean up 6s auto-dismiss timers on dismiss or unmount.
- **Test mock compatibility:** Existing tests in `ui.test.tsx` mock `/api/ping` with `{ alerts: [], wallets: [] }`; silent hydration handles empty or pre-populated arrays without breaking existing tests.

## Test plan
- `client/src/__tests__/ui.test.tsx`:
  - Initial hydration with `$250` `buy` alert renders no toast.
  - Next poll adding `$101` `buy` and `$500` `exit_deployer` renders both in bottom-right toast stack.
  - Next poll adding `$100` `buy`, `$45` `sell`, and `consensus` renders no toast.
  - Repeated poll with same `$250` alert does not duplicate toast.
  - Clicking toast from `Market` tab switches to `Ping` tab and dismisses toast.
  - Clicking close button or advancing timers by 6 seconds removes toast.
- Commands: `cd client && npm test` and `cd client && npm run build`.
