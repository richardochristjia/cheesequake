# Falsify: `wallet-backfill`

fix: Silent backfill of a tracked wallet still fires `exit_wallet` and `exit_deployer` alerts in `checkExits` (Reviewer A — Correctness). Reproduced: running `runWalletCycle` on a newly tracked wallet with no cursor and a historical sell (`hist-sell-1`) of a listed candidate inserts an `exit_deployer`/`exit_wallet` row into `alerts` via `checkExits` (`src/ping.js:84,103-109`), violating Acceptance Criterion 1 (`0` rows in `alerts`) and `.agents/RECORD.md:49`.
fix: Transient `null` RPC transaction halfway through initial backfill converts the remainder of the backfill into a live poll that fires alerts (Reviewer A — Correctness). Reproduced: with signatures `s1, s2, s3` on a new tracked wallet where `rpc.transaction('s2')` returns `null` on cycle 1 and resolves on cycle 2, `setCursor.run(wallet, 's1')` (`src/ping.js:53`) persists before breaking on `s2` (`src/ping.js:38`), so cycle 2 runs with `cur = 's1'` (`backfill = false`) and fires 2 live `buy` alerts for historical transactions `s2` and `s3`.

## For the fixer

1. **fix — Silent backfill of a tracked wallet still fires `exit_wallet` and `exit_deployer` alerts in `checkExits` (`src/ping.js:45-51,84,96-109`)**
   - **What the fix buys:** Ensures backfilled `'sell'` and `'out'` trades recorded during a tracked wallet's initial backfill never trigger `exit_wallet` or `exit_deployer` alerts in `checkExits` (on the initial cycle or later cycles), satisfying Acceptance Criterion 1 and `.agents/RECORD.md:49`.
   - **Proving test:** Add a test in `test/ping.test.js` (`first cycle silently backfills tracked wallet sell on a listed candidate without firing exit alerts`) where a listed candidate's creator/tracked wallet is polled for the first time with a historical sell and `SELECT COUNT(*) FROM alerts` is asserted to be `0` (fails now with `1`, passes with the fix).

2. **fix — Transient `null` RPC transaction halfway through initial backfill converts the remainder of the backfill into a live poll that fires alerts (`src/ping.js:21,29-42,53`)**
   - **What the fix buys:** Keeps initial backfill atomic with respect to `wallet_cursor` (only advancing `wallet_cursor` once the initial backfill loop finishes without breaking on a retryable `null` transaction), so a `pending_sigs` retry during first-sight backfill still records the batch silently without firing `buy`, `sell`, or `consensus` alerts.
   - **Proving test:** Add a test in `test/ping.test.js` (`transient null transaction during initial backfill retries on next cycle with 0 alerts`) where `s2` returns `null` on cycle 1 and resolves on cycle 2, asserting `3` rows in `trades`, `wallet_cursor = 's3'`, and `0` rows in `alerts` (fails now with `2` alerts, passes with the fix).

## For the user

- None.

## For the PR's open findings

- None.

## Dismissed

- None.
