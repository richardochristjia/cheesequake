## Alert Watcher & State
- [x] Add `/api/ping` polling on `refreshTick` in `client/src/App.tsx` with silent initial hydration and seen-key deduplication
- [x] Enqueue new alerts with `typeof detail?.usd === 'number' && detail.usd > 100` into a bounded toast queue (max 4 visible, 6s auto-dismiss)

## Sonner Toast UI
- [x] Create `client/src/components/PingToaster.tsx` styled in the dark-amber glass theme at `bottom-4 right-4 z-50`
- [x] Wire click-to-open-`Ping`-tab and close-button dismissal between `PingToaster` and `App.tsx`

## Tests & Build
- [x] Add test cases for hydration, `>$100` threshold, `<= $100` / non-USD filtering, deduplication, click navigation, and dismiss/timeout in `client/src/__tests__/ui.test.tsx`

## Verification
- [x] Verify opening the dashboard does not show toasts for historical `>$100` alerts already in `/api/ping`
- [x] Verify subsequent `/api/ping` polls with new `buy`, `sell`, `exit_wallet`, or `exit_deployer` alerts (`detail.usd > 100`) show bottom-right toasts across any tab
- [x] Verify alerts with `detail.usd <= 100` or without `detail.usd` do not trigger toasts
- [x] Verify clicking a toast navigates to the `Ping` tab and dismisses it, close button dismisses without tab change, and toasts auto-dismiss after 6 seconds
- [x] Verify `cd client && npm test` and `cd client && npm run build` pass
- [x] Update the Record: review the complete implementation; if it matches the planned Record Update (`- (dashboard) The dashboard polls ping alerts across all tabs and displays bottom-right toast notifications for new trade alerts exceeding $100.`), write that exact entry into `.agents/RECORD.md`; if the implementation diverged, do not write a wrong entry and instead surface the divergence in the final summary.
