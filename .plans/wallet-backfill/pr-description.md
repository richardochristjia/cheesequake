# feat(ping): backfill tracked wallets on first sight and skip failed sigs

## Summary
- Request `maxSupportedTransactionVersion: 1` in `createRpc().transaction()` (`src/sources/solana.js`) so version 1 Solana transactions do not fail the wallet poll cycle.
- Add `walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 }` configuration in `src/config.js`.
- Silently backfill up to `backfillTxLimit` (20) recent non-error transactions on first sight for tracked wallets (`!cur && tracked.has(wallet)`) without raising `buy`, `sell`, `consensus`, `exit_wallet`, or `exit_deployer` alerts, while keeping `limit: 1` cursor-only initialization for untracked deployers (`src/ping.js`).
- Keep `wallet_cursor` atomic across initial backfill batches so a transient `null` RPC transaction retried via `pending_sigs` still completes the initial backfill silently (`src/ping.js`).
- Skip failed (`s.err != null`) signatures before calling `rpc.transaction()` while still advancing `wallet_cursor` past them (`src/ping.js`).

## How it was tried
- Browser walkthrough skipped per Tier M (`tier.md`).
- Verified with unit and integration tests (`61/61` passing):
  ```sh
  node --test
  node --check src/sources/solana.js src/config.js src/ping.js test/helpers.js test/ping.test.js test/sources.test.js
  ```

## Needs your call
- **Manual step from plan (`plan.md` AC 8):** Clear 0-trade tracked-wallet rows in `wallet_cursor` in `data/cheesequake.db` and let the running process poll so tracked wallets populate trades in the dashboard.
- **Open review consideration (`review.md` #3):** Live polling (`cur != null`) fetches `sigLimit` (100) newest signatures and processes up to `txLimit` (20) non-error transactions per cycle; if a wallet has >20 non-error transactions in a single 60s poll window, older transactions beyond the 20 newest in that window are skipped when advancing `wallet_cursor`.
