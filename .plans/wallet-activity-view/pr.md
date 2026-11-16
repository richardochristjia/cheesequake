# feat(ping): filter wallet activity by wallet and show wallet labels

## Summary
- Build a registered wallet label lookup map (`address -> label`) from `wallets()` and attach `wallet_label` and `detail.wallet_labels` (for `consensus` alerts) to alerts returned by `/api/ping` and `/api/watch`.
- Return `wallets` (`[{ address, label }]`) in `/api/ping` and support optional `?wallet=<address>` filtering (validated against base58 `B58`, composable with `?kind=`, matching both direct alerts and `consensus` alerts containing the wallet before applying the 200-row limit).
- Pass `wallets()` into `watchList(db, now, config, wallets)` in `src/score.js` across `GET`, `POST`, and `DELETE /api/watch`.
- Update `public/index.html` to add a persistent `<select aria-label="Wallet">` filter on the **Ping** tab and render registered wallet user names alongside address links in both **Ping** and **Watch** alert tables (including participating wallet names on `consensus` alerts).
- Add API and dashboard VM integration tests in `test/server.test.js` covering wallet label enrichment, `?wallet=` + `?kind=` filtering, >200 consensus alert preservation, invalid wallet `400` responses, and DOM rendering.

## How it was tried
- Browser walkthrough was skipped per Tier M (`tier.md`).
- Verified via the full automated unit and dashboard VM test suite (`69/69` passing) and syntax checks:
  ```sh
  node --check src/server.js src/score.js test/server.test.js
  npm test
  ```

## Needs your call
- None (0 blocking or open findings, 0 divergences).
