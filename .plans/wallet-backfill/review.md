# Interrogate Review: `wallet-backfill` (Single-Angle: Correctness)

> **Mode:** Single-angle review (**Correctness Reviewer** — Correctness; Root Causes vs. Symptoms).
> **Context Pack:** Read and cited from `.plans/wallet-backfill/context-pack.md`.

### Intent
> Tracked wallets with no `wallet_cursor` (`src/ping.js:14-27`) silently backfill up to `config.walletPoll.backfillTxLimit` (20) non-error transactions from the newest `sigLimit` (100) signatures into `trades` without raising alerts (`src/ping.js:48-51`), while untracked deployers keep `limit: 1` cursor-only initialization (`src/ping.js:16-20`). `pollWallet` also skips `s.err != null` signatures without calling `rpc.transaction` while advancing `wallet_cursor` (`src/ping.js:29-32`), and `createRpc().transaction()` requests `maxSupportedTransactionVersion: 1` (`src/sources/solana.js:15`).

### Reviewers
- Reviewer A: Correctness, 4 findings

---

### Act On

#### 1. [critical] Silent backfill of a tracked wallet still fires `exit_wallet` and `exit_deployer` alerts in `checkExits`
- **Raised by:** Reviewer A (Correctness)
- **Location:** `src/ping.js:45-51`, `src/ping.js:84`, `src/ping.js:96-109` (cited in `.plans/wallet-backfill/context-pack.md:7,29,35,44`)
- **Why it matters:** Acceptance Criterion 1 (`context-pack.md:29`) states: *"First poll of a tracked wallet with no cursor backfills up to `config.walletPoll.backfillTxLimit` non-error transactions into `trades`, sets `wallet_cursor` to the newest signature, and inserts `0` rows into `alerts`."* Similarly, `.agents/RECORD.md:49` (`context-pack.md:35,56`) states: *"Newly tracked wallets are backfilled from recent on-chain transactions on first sight without raising alerts."* While `pollWallet` gates per-trade `buy`/`sell`/`consensus` alerts behind `if (!backfill && ...)` (`src/ping.js:48`), it inserts backfilled `'sell'` and `'out'` rows into `trades` (`src/ping.js:45-46`) with no distinction between backfilled and live trades. At the end of `runWalletCycle` (`src/ping.js:84`), `checkExits` queries `SELECT wallet, side, ts, quote_usd FROM trades WHERE mint = ? AND side IN ('sell','out')` (`src/ping.js:103`) with **no timestamp lower bound** and fires `exit_wallet` / `exit_deployer` alerts for any listed candidate in the last 24h (`src/ping.js:99,106-109`). Thus, adding a wallet to `wallets.txt` that previously sold a currently listed candidate immediately raises an `exit_wallet` (or `exit_deployer`) alert on first sight.
- **Proof (real run):**
  ```js
  const db = openDb(':memory:');
  const mint = addr('M'), w = addr('W');
  const now = 1_000_000 * 1000;
  db.prepare('INSERT INTO tokens(mint, creator) VALUES (?,?)').run(mint, w);
  db.prepare('INSERT INTO candidates(ts, mint, score, band, listed) VALUES (?,?,?,?,1)').run(now / 1000 - 600, mint, 70, 'confirm');
  const rpc = fakeRpc({ [w]: [{ signature: 'hist-sell-1', tx: tx({ wallet: w, mint, token: -100, sol: 1, blockTime: 500 }) }] });
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => now });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);
  // FAILS: alerts contains [{ kind: 'exit_deployer', ts: 500 }] (or 'exit_wallet' when creator !== w)
  ```

#### 2. [warning] Transient `null` RPC transaction halfway through initial backfill converts the remainder of the backfill into a live poll that fires alerts
- **Raised by:** Reviewer A (Correctness)
- **Location:** `src/ping.js:21`, `src/ping.js:34-42`, `src/ping.js:53` (cited in `.plans/wallet-backfill/context-pack.md:43,95-125`)
- **Why it matters:** `backfill` is derived solely from `const backfill = !cur` at the start of `pollWallet` (`src/ping.js:21`). Because `sigs` is processed oldest-first (`src/ping.js:26`) and `setCursor.run(wallet, s.signature)` runs after each processed signature (`src/ping.js:30,53`), if an older signature `s1` succeeds (setting `wallet_cursor = 's1'`) and a newer signature `s2` in the same initial backfill batch returns `null` from `rpc.transaction(s2)` (`src/ping.js:34-38`), the loop `break`s (`src/ping.js:38`) with `wallet_cursor` already persisted as `'s1'`. On the very next cycle, `cur` is `'s1'` (non-null), so `backfill` is `false` (`src/ping.js:21`). All remaining historical signatures after `s1` (`s2`, `s3`, ...) are now processed in live mode and fire `buy`, `sell`, and `consensus` alerts for historical transactions from before the wallet was first seen. Conversely, if the very first (oldest) signature in the backfill returns `null`, `wallet_cursor` stays `null` and the wallet re-runs full backfill mode until `s1` either resolves or hits `MAX_NULL_CYCLES`.
- **Proof (real run):**
  ```js
  const db = openDb(':memory:');
  const w = addr('B');
  let s2Null = true;
  const baseRpc = fakeRpc({
    [w]: [
      { signature: 's1', tx: tx({ wallet: w, blockTime: 100 }) },
      { signature: 's2', tx: tx({ wallet: w, blockTime: 110 }) },
      { signature: 's3', tx: tx({ wallet: w, blockTime: 120 }) },
    ],
  });
  const rpc = { ...baseRpc, async transaction(sig) { return sig === 's2' && s2Null ? null : baseRpc.transaction(sig); } };
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 }); // Cycle 1 (first sight): sets cur = 's1', breaks on s2
  s2Null = false;
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 }); // Cycle 2: cur is 's1', so s2 and s3 fire 2 'buy' alerts!
  // Actual alerts after cycle 2: [{ kind: 'buy', detail: '{"usd":100,"sig":"s2"}' }, { kind: 'buy', detail: '{"usd":100,"sig":"s3"}' }]
  ```

---

### Consider

#### 3. [warning] Live polling (`cur != null`) silently drops older non-error transactions when a wallet has `> txLimit` (20) non-error signatures in one cycle
- **Raised by:** Reviewer A (Correctness)
- **Location:** `src/ping.js:22-26`, `src/ping.js:53` (cited in `.plans/wallet-backfill/context-pack.md:103-107`)
- **Tradeoff:** Previously, live polling called `rpc.signatures(wallet, { limit: 20, until: cur })` (`context-pack.md:101`). Now it fetches `limit: sigLimit` (100) newest signatures and filters with `allSigs.filter((s) => s.err != null || ++ok <= maxTx).reverse()` (`src/ping.js:24-26`). Because `allSigs` is ordered newest-first, `++ok <= maxTx` keeps the **20 newest** non-error signatures (`s6..s25` in a 25-tx burst), skips the older non-error signatures (`s1..s5`) between `cur` and `s6`, and then advances `wallet_cursor` all the way to `s25` (`src/ping.js:53`), permanently skipping `s1..s5`. However, Solana's `getSignaturesForAddress` RPC itself always returns newest-first up to `limit` when `until` is passed, so any single-call bounded poll above `maxTx` must either drop older transactions in the window or leave the cursor behind (which `until` cannot paginate forward from without `before`). Worth considering whether `backfill` trades should also be excluded from live `checkConsensus` windows (`src/ping.js:61-63`) if a wallet is added mid-hour and then makes 1 new buy, or if counting backfilled buys toward a subsequent live buy's consensus window is intended.
- **Proof (real run):**
  ```js
  // With cur = 's0' and 25 new non-error signatures s1..s25 arriving in one cycle:
  // recorded trades are s6..s25 (s1..s5 permanently dropped) and wallet_cursor advances to 's25'.
  ```

---

### Noted

#### 4. [nit] Tracked wallet with only empty signature history (`allSigs.length === 0`) leaves `wallet_cursor` unset
- **Raised by:** Reviewer A (Correctness)
- **Location:** `src/ping.js:24-28` (cited in `.plans/wallet-backfill/context-pack.md:105-110`)
- **Rationale:** If a brand-new wallet address in `wallets.txt` has `0` on-chain signatures ever, `allSigs` is `[]` and `wallet_cursor` remains unset until its first transaction appears. Once its first transaction appears on-chain, `!cur` is still true so that first transaction will be treated as an initial backfill (silent) rather than alerting as a live trade. Low impact in practice because tracked wallets are curated from active traders.

---

### Dismissed

- None.

### Agreement Map
- Single-angle review (**Correctness Reviewer** only, per caller instructions); cross-reviewer synthesis skipped as specified in `interrogate/SKILL.md` ("One-angle mode").
