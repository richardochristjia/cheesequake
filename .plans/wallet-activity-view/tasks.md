## Phase 1: Backend API & Watch Enrichment
- [x] Update `watchList` in `src/score.js` to accept `wallets = []` and enrich each coin's `alerts` with `wallet_label` and (for `consensus` alerts) `detail.wallet_labels`
- [x] Update `src/server.js` to pass `wallets()` into `watchList` and enhance `/api/ping` with `wallets` list, `wallet_label` / `detail.wallet_labels` enrichment, and `?wallet=` base58 validation and filtering

## Phase 2: Dashboard Wallet Activity View & Labels
- [x] Update `public/index.html` to render registered wallet user names (`wallet_label` and `detail.wallet_labels`) in the Ping table, Watch per-coin alert tables, and consensus alert details
- [x] Add a wallet filter `<select>` in the Ping tab of `public/index.html` that persists state across refreshes and queries `/api/ping` with `wallet=`

## Phase 3: Tests
- [x] Add API and dashboard VM tests in `test/server.test.js` covering `/api/ping` wallet filtering, `400` validation, `/api/ping` and `/api/watch` label enrichment, and Ping/Watch UI rendering

## Verification
- [x] `/api/ping` includes `wallets` (`[{ address, label }]`) and enriches each returned alert with `wallet_label` and `detail.wallet_labels`
- [x] `/api/ping?wallet=<address>` returns only direct and consensus alerts for `<address>`, composes with `?kind=`, and returns HTTP `400` for invalid base58 addresses
- [x] `/api/watch` enriches each watched coin's `alerts` with `wallet_label` and `detail.wallet_labels`
- [x] The Ping tab renders a wallet `<select>` filter beside the kind filter, persists selection across refreshes, and displays registered wallet user names in the Wallet column and consensus alerts
- [x] The Watch tab's per-coin alert tables display registered wallet user names in the Wallet column and consensus alerts
- [x] All tests pass via `npm test` and `public/index.html` never assigns markup from strings
