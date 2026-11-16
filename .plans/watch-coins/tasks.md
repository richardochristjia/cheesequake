## Phase 1: Schema & Core Logic
- [x] Add `watched_coins(mint PRIMARY KEY, added_ts)` table to `SCHEMA` in `src/db.js`.
- [x] Update `deployerWallets` and `checkExits` in `src/ping.js` to include watched mints from `watched_coins` regardless of `listed` status or 24h candidate age.
- [x] Update `runCandidates` in `src/score.js` to place watched mints first in `universe` and evaluate all vetoes on watched mints even when a cheap veto fails, and export `watchedMints` and `watchList` with three-state hold classification (`safe`, `caution`, `flag`), plain-English reasons, latest pool/market fields, and per-coin ping alerts.

## Phase 2: Server API & Runtime Wiring
- [x] Add `GET /api/watch`, `POST /api/watch?mint=<mint>`, and `DELETE /api/watch?mint=<mint>` in `src/server.js` with `B58` validation, `onWatch` callback invocation, and `405` enforcement on all other non-`GET` routes.
- [x] Wire `onWatch` in `src/main.js` to trigger an immediate background `runCandidates` + `checkExits` cycle when a coin is watched.

## Phase 3: Dashboard UI & Tests
- [x] Update `public/index.html` to add the `Watch` tab, mint watch form, quick `Watch`/`Watching` buttons in `Running now` and `Ping`, hold/red-flag badge and plain-English reasons, per-coin ping table, `Unwatch` button, and expandable DexScreener live candle chart `<iframe>` (`openCharts` state preserved across refreshes).
- [x] Add unit tests in `test/ping.test.js`, `test/score.test.js`, and `test/server.test.js` covering watched-coin exit alerts, full veto evaluation, `watchList` classification, `/api/watch` CRUD and error codes, and the `Watch` tab UI and chart toggle.

## Verification
- [x] `POST /api/watch?mint=<mint>` and `DELETE /api/watch?mint=<mint>` add and remove watched mints, invalid mints return `400`, and `POST` to other routes still returns `405` (`node --test test/server.test.js`).
- [x] `runCandidates` places watched mints first and evaluates all vetoes on watched mints even when a cheap veto trips (`node --test test/score.test.js`).
- [x] `deployerWallets` and `checkExits` monitor watched mints even when `listed = 0` or older than 24 hours (`node --test test/ping.test.js`).
- [x] `watchList` and `GET /api/watch` classify watched coins into `safe` (`Safe to hold`), `caution` (`Caution`), or `flag` (`Red flag`) with plain-English reasons, latest pool data, and per-coin ping alerts (`node --test test/score.test.js test/server.test.js`).
- [x] The dashboard `Watch` tab renders watched coins, toggles the embedded DexScreener candle chart `<iframe>` while preserving open chart state across refreshes, and never assigns `innerHTML` (`node --test test/server.test.js`).
- [x] Full test suite passes with zero network calls (`node --test`).
- [x] Record Updates: (1) review the complete implementation; (2a) if the implementation matches the planned Record Updates, amend `- (ping) Exit alerts are raised for listed and watched tokens on tracked-wallet sells, deployer sells and sharp liquidity drops.` and add `- (watch) Watched tokens are managed from the dashboard and persisted to SQLite.` and `- (watch) Each watched token carries a hold status derived from its latest safety vetoes, exit alerts and score.` in `.agents/RECORD.md`; (2b) if the implementation diverged from the planned entries, do not write a wrong entry — instead surface the divergence in the final implementation summary so the user can resolve it.

## Manual checks
- [ ] manual: Start the server with `npm start`, watch a live Solana mint in the Watch tab, and click "Show chart" to verify the live DexScreener candle iframe loads in your browser.
