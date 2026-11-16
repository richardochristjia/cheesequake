# Context pack

BASE: narratives-beginner
CHANGED: 8 files, +129/-13

## What this change does
Tracked wallets with no `wallet_cursor` (`src/ping.js:14-27`) silently backfill up to `config.walletPoll.backfillTxLimit` (20) non-error transactions from the newest `sigLimit` (100) signatures into `trades` without alerts (`src/ping.js:48-51`); untracked deployers keep `limit: 1` cursor-only init (`src/ping.js:16-20`). `pollWallet` also skips `s.err != null` signatures while advancing `wallet_cursor` (`src/ping.js:29-32`), and `createRpc().transaction()` requests `maxSupportedTransactionVersion: 1` (`src/sources/solana.js:15`).

## Files
- `.agents/RECORD.md` — product record; adds `(wallets)` silent backfill entry (`.agents/RECORD.md:49`)
- `README.md` — docs; updates `Limits` bullet on wallet history backfill (`README.md:43`)
- `src/config.js` — defaults; adds `walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 }` (`src/config.js:28`)
- `src/ping.js` — wallet polling; adds silent tracked backfill, deployer cursor-only init, and `s.err != null` skip (`src/ping.js:13-56`)
- `src/sources/solana.js` — Solana RPC client; sets `maxSupportedTransactionVersion: 1` in `transaction(sig)` (`src/sources/solana.js:15`)
- `test/helpers.js` — test fixtures; includes `err` and fallback `blockTime` in `fakeRpc.signatures` (`test/helpers.js:22-30`)
- `test/ping.test.js` — unit tests for tracked backfill, deployer init, `s.err` skipping, and live alerts (`test/ping.test.js:18-100`)
- `test/sources.test.js` — unit test verifying `maxSupportedTransactionVersion: 1` (`test/sources.test.js:1-20`)

## API contracts
- `POST <rpcUrl>` `getSignaturesForAddress` (`[address, { limit, until? }]`) → `Array<{ signature, blockTime?, err }>`; declared in `src/sources/solana.js:13-14`, called in `src/ping.js:17,24`
- `POST <rpcUrl>` `getTransaction` (`[sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]`) → `{ blockTime, meta, transaction } | null`; declared in `src/sources/solana.js:15`, called in `src/ping.js:33`

## Test entry points
- `test/ping.test.js` — `node --test test/ping.test.js`
- `test/sources.test.js` — `node --test test/sources.test.js`
- Full suite — `node --test`

## Acceptance criteria
1. First poll of a tracked wallet with no cursor backfills up to `config.walletPoll.backfillTxLimit` non-error transactions into `trades`, sets `wallet_cursor` to the newest signature, and inserts `0` rows into `alerts` (`node --test test/ping.test.js`).
2. First poll of an untracked deployer wallet with no cursor sets `wallet_cursor` with `limit: 1` and makes `0` `rpc.transaction` calls (`node --test test/ping.test.js`).
3. Signatures with `err != null` are skipped without calling `rpc.transaction`, and `wallet_cursor` still advances to the newest signature (`node --test test/ping.test.js`).
4. Subsequent cycles after initial backfill record new trades and fire `buy`, `sell`, and `consensus` alerts (`node --test test/ping.test.js`).
5. `createRpc().transaction()` sends `maxSupportedTransactionVersion: 1` (`node --test test/sources.test.js`).
6. Full test suite passes with zero network calls (`node --test`).
7. Record Update: `- (wallets) Newly tracked wallets are backfilled from recent on-chain transactions on first sight without raising alerts.` added to `.agents/RECORD.md`.
8. manual: Clear 0-trade tracked-wallet rows in `wallet_cursor` in `data/cheesequake.db` and let the running process poll so tracked wallets populate trades in the dashboard. (outside automated verification)

## Do not re-derive
- `!cur && tracked.has(wallet)` (`src/ping.js:14-21`) triggers backfill; `runWalletCycle` wraps `tracked` in a `Set` (`src/ping.js:75`) and polls `[...tracked, ...deployers]` (`src/ping.js:76`).
- Previously `if (!cur)` ran for all wallets (`src/ping.js:16`), fetching `limit: 1` signature and returning `[]`.
- `rpc.signatures` returns newest-first (`src/sources/solana.js:13-14`, `test/helpers.js:23`); `allSigs.filter((s) => s.err != null || ++ok <= maxTx).reverse()` (`src/ping.js:26`) processes oldest-first so `setCursor` ends at `allSigs[0].signature` even when all signatures fail (`src/ping.js:29-31,53`).
- `classify()` (`src/trades.js:27`) already ignores `tx.meta?.err`; skipping `s.err != null` in `pollWallet` (`src/ping.js:29-32`) avoids the `rpc.transaction` call.
- Null `rpc.transaction` responses retry up to `MAX_NULL_CYCLES = 3` via `pending_sigs` before advancing the cursor (`src/ping.js:10,34-42`).
- Per-trade `buy`/`sell`/`consensus` alerts are gated by `!backfill` (`src/ping.js:48`), while `checkExits` (`src/ping.js:84,96-122`) still inspects `trades` against listed candidates.

## Diff
```diff
diff --git a/.agents/RECORD.md b/.agents/RECORD.md
index 2c54ba3..4a54b4f 100644
--- a/.agents/RECORD.md
+++ b/.agents/RECORD.md
@@ -46,6 +46,7 @@ Entries are added or amended **only with human approval**.
 - (data) Wallet activity is read from a Solana RPC endpoint whose address is a config setting.
 - (store) The scanner persists snapshots, wallet events and alerts to one local SQLite file.
 - (wallets) Tracked wallets are read from a user-edited text file.
+- (wallets) Newly tracked wallets are backfilled from recent on-chain transactions on first sight without raising alerts.
 - (wallets) Each tracked wallet currently carries a scorecard computed from its own recorded trades.
 - (ping) A consensus alert is raised when at least three non-sniper tracked wallets buy the same token within sixty minutes.
 - (ping) Exit alerts are raised for listed tokens on tracked-wallet sells, deployer sells and sharp liquidity drops.
diff --git a/README.md b/README.md
index 2b78c3a..6bacc6b 100644
--- a/README.md
+++ b/README.md
@@ -40,4 +40,4 @@ One wallet per line: `<address>[,<label>]`. `#` starts a comment. Bad lines are
 - Holder, insider and lock data come from one source.
 - Social media data is not an input.
 - Keyword themes are crude. Scores are unvalidated until the outcome log has weeks of data.
-- Wallet history is not backfilled: a wallet is watched from the moment the program first sees it.
+- Tracked wallets backfill only their recent transactions on first sight (up to 20 non-error transactions from the latest 100 signatures) without raising alerts; older history is not fetched.
diff --git a/src/config.js b/src/config.js
index 4f00cb3..d43f76a 100644
--- a/src/config.js
+++ b/src/config.js
@@ -25,6 +25,7 @@ export const config = Object.freeze({
   outcome: { horizonsHours: [1, 6, 24] },
   tracer: { depth: 4, signatures: 10, top: 2, cacheHours: 24 },
   theme: { minTokens: 3 },
+  walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 },
 });
 
 export const bandOf = (score) => config.bands.find(([, min]) => score >= min)[0];
diff --git a/src/ping.js b/src/ping.js
index e7fd0d2..1f23893 100644
--- a/src/ping.js
+++ b/src/ping.js
@@ -9,18 +9,27 @@ export function insertAlert(db, { ts, kind, mint = null, wallet = null, detail =
 
 const MAX_NULL_CYCLES = 3;
 
-// One wallet, one cycle. Returns the trades recorded. No backfill: first sight only sets the cursor.
+// One wallet, one cycle. Returns the trades recorded. Tracked wallets backfill silently on first sight; untracked only set the cursor.
 export async function pollWallet({ db, rpc, wallet, tracked, solUsd, now, eligible = (w) => scorecardFor(db, w, config).class !== 'sniper', config = defaultConfig }) {
   const cur = db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(wallet)?.last_sig;
   const setCursor = db.prepare('INSERT INTO wallet_cursor(address, last_sig) VALUES (?,?) ON CONFLICT(address) DO UPDATE SET last_sig = excluded.last_sig');
-  if (!cur) {
+  if (!cur && !tracked.has(wallet)) {
     const [first] = await rpc.signatures(wallet, { limit: 1 });
     if (first) setCursor.run(wallet, first.signature);
     return [];
   }
-  const sigs = (await rpc.signatures(wallet, { limit: 20, until: cur })).reverse();
+  const backfill = !cur;
+  const { sigLimit = 100, txLimit = 20, backfillTxLimit = 20 } = config.walletPoll ?? defaultConfig.walletPoll;
+  const maxTx = backfill ? backfillTxLimit : txLimit;
+  const allSigs = await rpc.signatures(wallet, { limit: sigLimit, ...(cur ? { until: cur } : {}) });
+  let ok = 0;
+  const sigs = allSigs.filter((s) => s.err != null || ++ok <= maxTx).reverse();
   const recorded = [];
   for (const s of sigs) {
+    if (s.err != null) {
+      setCursor.run(wallet, s.signature);
+      continue;
+    }
     const tx = await rpc.transaction(s.signature);
     if (!tx) {
       // Fresh signatures can be unavailable; retry next cycle, give up after 3.
@@ -36,7 +45,7 @@ export async function pollWallet({ db, rpc, wallet, tracked, solUsd, now, eligib
       db.prepare('INSERT OR IGNORE INTO trades(sig, wallet, mint, side, token_amount, quote_usd, ts) VALUES (?,?,?,?,?,?,?)')
         .run(s.signature, wallet, t.mint, t.side, t.tokenAmount, t.quoteUsd, ts);
       recorded.push({ ...t, sig: s.signature, ts });
-      if (tracked.has(wallet) && (t.side === 'buy' || t.side === 'sell')) {
+      if (!backfill && tracked.has(wallet) && (t.side === 'buy' || t.side === 'sell')) {
         insertAlert(db, { ts, kind: t.side, mint: t.mint, wallet, detail: { usd: t.quoteUsd, sig: s.signature }, dedupe: `${t.side}:${s.signature}:${t.mint}` });
         if (t.side === 'buy') checkConsensus({ db, mint: t.mint, ts, tracked, eligible, config });
       }
diff --git a/src/sources/solana.js b/src/sources/solana.js
index dc0c2c7..8ecb7ab 100644
--- a/src/sources/solana.js
+++ b/src/sources/solana.js
@@ -12,7 +12,7 @@ export function createRpc(get, url) {
   return {
     signatures: (address, { limit, until } = {}) =>
       call('getSignaturesForAddress', [address, { limit, ...(until ? { until } : {}) }]).then((r) => r ?? []),
-    transaction: (sig) => call('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]),
+    transaction: (sig) => call('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]),
     async mintInfo(mint) {
       const r = await call('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
       const i = r?.value?.data?.parsed?.info;
diff --git a/test/helpers.js b/test/helpers.js
index 48f483f..0d88136 100644
--- a/test/helpers.js
+++ b/test/helpers.js
@@ -22,7 +22,11 @@ export function fakeRpc(book) {
     async signatures(w, { limit, until }) {
       const all = [...(book[w] || [])].reverse(); // newest first
       const i = until ? all.findIndex((s) => s.signature === until) : -1;
-      return (i >= 0 ? all.slice(0, i) : all).slice(0, limit).map((s) => ({ signature: s.signature, blockTime: s.tx.blockTime }));
+      return (i >= 0 ? all.slice(0, i) : all).slice(0, limit).map((s) => ({
+        signature: s.signature,
+        blockTime: s.blockTime ?? s.tx?.blockTime,
+        err: s.err ?? s.tx?.meta?.err ?? null,
+      }));
     },
     async transaction(sig) {
       calls.tx++;
diff --git a/test/ping.test.js b/test/ping.test.js
index 480d549..11d30cf 100644
--- a/test/ping.test.js
+++ b/test/ping.test.js
@@ -8,23 +8,104 @@ import { tx, fakeRpc, addr } from './helpers.js';
 async function scenario(times, extra = {}) {
   const db = openDb(':memory:');
   const wallets = times.map((_, i) => addr(String.fromCharCode(65 + i)));
-  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `old-${w}`, tx: tx({ wallet: w, blockTime: 1 }) }]]));
+  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `old-${w}`, tx: tx({ wallet: w, mint: addr('O'), blockTime: 1 }) }]]));
   const rpc = fakeRpc(book);
   const run = () => runWalletCycle({ db, rpc, tracked: wallets, solUsd: 100, now: () => 1e12, ...extra });
-  await run(); // first cycle sets cursors
+  await run(); // first cycle backfills silently and sets cursors
   wallets.forEach((w, i) => book[w].push({ signature: `buy-${w}`, tx: tx({ wallet: w, blockTime: times[i] }) }));
   await run();
   return db;
 }
 const count = (db, kind) => db.prepare('SELECT COUNT(*) c FROM alerts WHERE kind = ?').get(kind).c;
 
-test('first cycle sets cursor and fetches no transactions', async () => {
+test('first cycle silently backfills tracked wallet up to backfillTxLimit with 0 alerts', async () => {
   const db = openDb(':memory:');
   const w = addr('A');
-  const rpc = fakeRpc({ [w]: [{ signature: 's1', tx: tx({ wallet: w }) }] });
+  const sigs = Array.from({ length: 25 }, (_, i) => ({
+    signature: `s${i + 1}`,
+    tx: tx({ wallet: w, blockTime: 100 + i }),
+  }));
+  const rpc = fakeRpc({ [w]: sigs });
   await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 });
-  assert.equal(rpc.calls.tx, 0);
-  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor').get().last_sig, 's1');
+  assert.equal(rpc.calls.tx, 20);
+  const trades = db.prepare('SELECT sig FROM trades ORDER BY ts ASC').all().map((r) => r.sig);
+  assert.equal(trades.length, 20);
+  assert.equal(trades[0], 's6');
+  assert.equal(trades[19], 's25');
+  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w).last_sig, 's25');
+  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);
+});
+
+test('first cycle on untracked deployer sets cursor with limit 1 and fetches 0 transactions', async () => {
+  const db = openDb(':memory:');
+  const d = addr('D');
+  let lastLimit = null;
+  const baseRpc = fakeRpc({ [d]: [{ signature: 'd1', tx: tx({ wallet: d }) }, { signature: 'd2', tx: tx({ wallet: d }) }] });
+  const rpc = {
+    ...baseRpc,
+    signatures(wallet, opts) {
+      lastLimit = opts?.limit;
+      return baseRpc.signatures(wallet, opts);
+    },
+  };
+  await runWalletCycle({ db, rpc, tracked: [], deployers: [d], solUsd: 100, now: () => 1e12 });
+  assert.equal(lastLimit, 1);
+  assert.equal(baseRpc.calls.tx, 0);
+  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(d).last_sig, 'd2');
+  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 0);
+});
+
+test('skips signatures with err != null without calling rpc.transaction and advances cursor', async () => {
+  const db = openDb(':memory:');
+  const w1 = addr('A');
+  const w2 = addr('B');
+  const book = {
+    [w1]: [
+      { signature: 'ok1', tx: tx({ wallet: w1, blockTime: 10 }) },
+      { signature: 'err1', err: { InstructionError: [0, 'Custom'] }, tx: tx({ wallet: w1, blockTime: 20 }) },
+    ],
+    [w2]: [
+      { signature: 'only-err-1', err: 'failed', tx: tx({ wallet: w2, blockTime: 10 }) },
+      { signature: 'only-err-2', err: 'failed', tx: tx({ wallet: w2, blockTime: 20 }) },
+    ],
+  };
+  const rpc = fakeRpc(book);
+  await runWalletCycle({ db, rpc, tracked: [w1, w2], solUsd: 100, now: () => 1e12 });
+  assert.equal(rpc.calls.tx, 1);
+  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w1).last_sig, 'err1');
+  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w2).last_sig, 'only-err-2');
+
+  // Subsequent live poll also skips failed signatures and advances cursor to newest
+  book[w1].push(
+    { signature: 'err2', err: 'failed', tx: tx({ wallet: w1, blockTime: 30 }) },
+    { signature: 'ok2', tx: tx({ wallet: w1, blockTime: 40 }) },
+    { signature: 'err3', err: 'failed', tx: tx({ wallet: w1, blockTime: 50 }) },
+  );
+  await runWalletCycle({ db, rpc, tracked: [w1, w2], solUsd: 100, now: () => 1e12 });
+  assert.equal(rpc.calls.tx, 2);
+  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w1).last_sig, 'err3');
+  assert.equal(count(db, 'buy'), 1);
+});
+
+test('subsequent cycles after initial backfill record new trades and fire buy, sell, and consensus alerts', async () => {
+  const db = openDb(':memory:');
+  const wallets = ['A', 'B', 'C'].map(addr);
+  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `init-${w}`, tx: tx({ wallet: w, mint: addr('O'), blockTime: 100 }) }]]));
+  const rpc = fakeRpc(book);
+  const run = () => runWalletCycle({ db, rpc, tracked: wallets, solUsd: 100, now: () => 1e12 });
+
+  await run();
+  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 3);
+  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);
+
+  wallets.forEach((w, i) => book[w].push({ signature: `buy-${w}`, tx: tx({ wallet: w, mint: addr('M'), blockTime: 1000 + i * 60 }) }));
+  book[wallets[0]].push({ signature: `sell-${wallets[0]}`, tx: tx({ wallet: wallets[0], mint: addr('M'), token: -100, sol: 1, blockTime: 1300 }) });
+  await run();
+
+  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 7);
+  assert.equal(count(db, 'buy'), 3);
+  assert.equal(count(db, 'sell'), 1);
+  assert.equal(count(db, 'consensus'), 1);
 });
 
 test('three wallets in 40 minutes, then a fourth: one consensus alert', async () => {
diff --git a/test/sources.test.js b/test/sources.test.js
new file mode 100644
index 0000000..3f88f86
--- /dev/null
+++ b/test/sources.test.js
@@ -0,0 +1,20 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { createRpc } from '../src/sources/solana.js';
+
+test('createRpc().transaction() requests maxSupportedTransactionVersion: 1', async () => {
+  let seen = null;
+  const rpc = createRpc(async (url, opts) => {
+    seen = { url, body: JSON.parse(opts.body) };
+    return { result: { blockTime: 123 } };
+  }, 'http://rpc.local');
+
+  const res = await rpc.transaction('sig-1');
+  assert.deepEqual(res, { blockTime: 123 });
+  assert.equal(seen.url, 'http://rpc.local');
+  assert.equal(seen.body.method, 'getTransaction');
+  assert.deepEqual(seen.body.params, [
+    'sig-1',
+    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 },
+  ]);
+});
```
