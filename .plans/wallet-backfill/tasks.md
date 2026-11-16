## Phase 1: RPC & Config
- [x] Update `createRpc().transaction()` in `src/sources/solana.js` to send `maxSupportedTransactionVersion: 1`
- [x] Add `walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 }` to `config` in `src/config.js`

## Phase 2: Backfill & Error Filtering
- [x] Update `pollWallet` in `src/ping.js` to silently backfill up to `config.walletPoll.backfillTxLimit` non-error transactions on first sight for tracked wallets, keep `limit: 1` cursor initialization for untracked deployer wallets, and skip `s.err != null` signatures while advancing `wallet_cursor`

## Phase 3: Tests & Docs
- [x] Update `fakeRpc` in `test/helpers.js` to expose `err` on returned signature items
- [x] Update `test/ping.test.js` and `test/sources.test.js` to cover tracked-wallet silent backfill, deployer cursor-only initialization, skipping failed signatures, post-backfill live alerts, and `maxSupportedTransactionVersion: 1`
- [x] Update the wallet history bullet in `README.md` to reflect initial backfill of recent transactions

## Verification
- [x] Verify that first poll of a tracked wallet with no cursor backfills up to `config.walletPoll.backfillTxLimit` non-error transactions into `trades`, sets `wallet_cursor` to the newest signature, and inserts `0` rows into `alerts` (`node --test test/ping.test.js`)
- [x] Verify that first poll of an untracked deployer wallet with no cursor sets `wallet_cursor` with `limit: 1` and makes `0` `rpc.transaction` calls (`node --test test/ping.test.js`)
- [x] Verify that signatures with `err != null` are skipped without calling `rpc.transaction`, and `wallet_cursor` still advances to the newest signature (`node --test test/ping.test.js`)
- [x] Verify that subsequent cycles after initial backfill record new trades and fire `buy`, `sell`, and `consensus` alerts (`node --test test/ping.test.js`)
- [x] Verify that `createRpc().transaction()` sends `maxSupportedTransactionVersion: 1` (`node --test test/sources.test.js`)
- [x] Verify that the full test suite passes (`node --test`)
- [x] Record Updates: (1) review the complete implementation; (2a) if the implementation matches the planned Record Updates, write `- (wallets) Newly tracked wallets are backfilled from recent on-chain transactions on first sight without raising alerts.` into `.agents/RECORD.md`; (2b) if the implementation diverged from the planned entries, do not write a wrong entry — instead surface the divergence in the final implementation summary so the user can resolve it

## Manual checks
- [ ] manual: Clear 0-trade tracked-wallet rows in `wallet_cursor` in `data/cheesequake.db` and let the running process poll so tracked wallets populate trades in the dashboard
