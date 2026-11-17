## Build
- [x] Update `client/src/App.tsx` to persist seen alert keys in `sessionStorage` (bounded to `MAX_SEEN_KEYS = 1000`), toast unseen `>$100` alerts from the last 5 minutes (`300s`) on initial load while silently marking older alerts as seen, and set `TOAST_DURATION_MS = 30000`; update `client/src/__tests__/ui.test.tsx` for 5-minute initial hydration, `sessionStorage` deduplication across remounts, and 30-second auto-dismiss; run `npm --prefix client test` and `npm --prefix client run build`.

## Verification
- [x] Opening the dashboard toasts unseen `>$100` trade alerts from the last 5 minutes and silently skips older `>$100` alerts (`npm --prefix client test`).
- [x] Refreshing/remounting after seeing or dismissing a recent `>$100` alert does not re-toast it (`npm --prefix client test`).
- [x] Live `>$100` alerts arriving on subsequent polls toast in the bottom-right corner and auto-dismiss after 30 seconds (`npm --prefix client test`).
- [x] `npm --prefix client test` and `npm --prefix client run build` pass.
- [x] Update `.agents/RECORD.md` line 61 if the implementation matches the planned Record Updates (`- (dashboard) The dashboard polls ping alerts across all tabs and displays bottom-right toast notifications for recent and new trade alerts exceeding $100.`); if the implementation diverged, do not write a wrong entry and surface the divergence in the final summary.
