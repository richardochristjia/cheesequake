# Wallet Backfill

## Problem

When `pollWallet` in `src/ping.js` sees a wallet with no entry in `wallet_cursor`, it only bookmarks the single newest signature (`limit: 1`) and returns `[]`, leaving tracked wallets at `"not enough trades yet"` on the scorecard until new round-trip trades occur. In addition, `createRpc().transaction()` in `src/sources/solana.js` requests `maxSupportedTransactionVersion: 0`, which causes the Solana RPC to reject version `1` transactions with an error that aborts the wallet poll cycle, and `pollWallet` calls `rpc.transaction()` on failed (`err !== null`) signatures even though `classify()` always discards them, burning the public RPC rate limit on failed MEV bot spam.

## Solution

- Request `maxSupportedTransactionVersion: 1` in `createRpc().transaction()` in `src/sources/solana.js`.
- Add `walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 }` to `config` in `src/config.js`.
- In `pollWallet` (`src/ping.js`):
  - When a wallet has no cursor (`!cur`) and is **not** in `tracked` (i.e. a deployer watch wallet), keep the existing `limit: 1` cursor-only initialization (`if (!cur && !tracked.has(wallet))`).
  - When a tracked wallet has no cursor (`!cur && tracked.has(wallet)`), fetch up to `config.walletPoll.sigLimit` signatures, set `wallet_cursor` to the newest signature when no non-error signatures exist, or process the newest `config.walletPoll.backfillTxLimit` non-error (`!s.err`) signatures in oldest-first order, inserting classified trades into `trades` **without** firing `buy`, `sell`, or `consensus` alerts, and advancing `wallet_cursor` to the newest signature seen (`allSigs[0].signature` once processed).
  - When a wallet already has a cursor (`cur`), fetch up to `config.walletPoll.sigLimit` signatures with `until: cur`, skip failed (`s.err != null`) signatures while advancing `wallet_cursor` past them, and fetch/classify up to `config.walletPoll.txLimit` non-error signatures oldest-first with normal `buy`/`sell`/`consensus` alerts.
- Update `test/helpers.js` so `fakeRpc.signatures` includes `err: s.err ?? s.tx?.meta?.err ?? null`, add unit tests in `test/ping.test.js` and `test/sources.test.js`, and update `README.md`.

## Files

- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/sources/solana.js` — Change `maxSupportedTransactionVersion` from `0` to `1` in `transaction(sig)`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/config.js` — Add `walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 }` default configuration.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/ping.js` — Backfill tracked wallets silently on first sight (`!cur && tracked.has(wallet)`), keep cursor-only init for untracked deployers, and skip `s.err` signatures before calling `rpc.transaction`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/helpers.js` — Include `err` on signature objects returned by `fakeRpc.signatures`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/ping.test.js` — Update first-cycle test and add tests for tracked-wallet silent backfill, deployer cursor-only init, skipping failed signatures, and post-backfill live alerts.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/sources.test.js` — Verify `rpc.transaction` sends `maxSupportedTransactionVersion: 1`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/README.md` — Update the Limits bullet to note that tracked wallets backfill recent transactions on first sight.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/.agents/RECORD.md` — Add the `(wallets)` record entry for silent first-sight backfill.

## Acceptance criteria

1. First poll of a tracked wallet with no cursor backfills up to `config.walletPoll.backfillTxLimit` non-error transactions into `trades`, sets `wallet_cursor` to the newest signature, and inserts `0` rows into `alerts` (`node --test test/ping.test.js`).
2. First poll of an untracked deployer wallet with no cursor sets `wallet_cursor` with `limit: 1` and makes `0` `rpc.transaction` calls (`node --test test/ping.test.js`).
3. Signatures with `err != null` are skipped without calling `rpc.transaction`, and `wallet_cursor` still advances to the newest signature (`node --test test/ping.test.js`).
4. Subsequent cycles after initial backfill record new trades and fire `buy`, `sell`, and `consensus` alerts (`node --test test/ping.test.js`).
5. `createRpc().transaction()` sends `maxSupportedTransactionVersion: 1` (`node --test test/sources.test.js`).
6. Full test suite passes with zero network calls (`node --test`).
7. Record Update: `- (wallets) Newly tracked wallets are backfilled from recent on-chain transactions on first sight without raising alerts.` added to `.agents/RECORD.md`.
8. `manual: Clear 0-trade tracked-wallet rows in wallet_cursor in data/cheesequake.db and let the running process poll so tracked wallets populate trades in the dashboard.`

## Risks

- **Public RPC rate limits during initial backfill of many wallets:** Capped by `config.walletPoll.backfillTxLimit` (20 non-error transactions per tracked wallet) and paced by `config.pace.rpc` (500ms gap + retry backoff).
- **Wallets where all `sigLimit` signatures failed (`s.err != null`):** Cursor still advances to the newest signature (`sigs[0].signature`) so the wallet does not remain stuck without a cursor on every cycle.
- **Unavailable (`null`) fresh transaction during backfill or live poll:** Existing `pending_sigs` retry logic (`MAX_NULL_CYCLES = 3`) breaks out of the loop and retries on the next cycle before advancing the cursor past that signature.

## Test plan

- `test/ping.test.js` — Covers silent backfill on first sight for tracked wallets, cursor-only first sight for untracked deployers, skipping `s.err != null` signatures without `rpc.transaction` calls, all-error signature lists advancing cursor, and live alerts/consensus on subsequent cycles.
- `test/sources.test.js` — Covers `maxSupportedTransactionVersion: 1` in `createRpc().transaction()`.
- Run command: `node --test`
