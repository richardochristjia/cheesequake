# Context pack

BASE: wallet-backfill
CHANGED: 10 files, +477/-33

## What this change does
Persists watched Solana mints in SQLite (`src/db.js:21`), scans them first in `runCandidates` with full vetoes (`src/score.js:90-143`), and monitors them in `deployerWallets`/`checkExits` regardless of listing or age (`src/ping.js:99-117`). Adds `/api/watch` (`src/server.js:18,52-63`) and a `Watch` tab with hold badges, reasons, alerts, and a lazy DexScreener chart `<iframe>` (`public/index.html:132-237`).

## Files
- `.agents/RECORD.md` — Invariant record; updates `(ping)` and adds `(watch)` rules (`.agents/RECORD.md:52-54`).
- `src/db.js` — SQLite schema; adds `watched_coins(mint PRIMARY KEY, added_ts)` (`src/db.js:21`).
- `src/ping.js` — Exit monitor; includes `watched_coins` in `deployerWallets` (`src/ping.js:99-107`) and `checkExits` (`src/ping.js:110-117`).
- `src/score.js` — Scorer; adds `watchedMints` (`src/score.js:79-81`), `watchList` (`src/score.js:188-245`), and full-veto scan for watched mints (`src/score.js:90-143`).
- `src/server.js` — HTTP server; adds `onWatch` (`src/server.js:12`) and `GET`/`POST`/`DELETE /api/watch` (`src/server.js:18,52-63`).
- `src/main.js` — Entrypoint; wires `onWatch` to `runCandidates` + `checkExits` (`src/main.js:44-49`).
- `public/index.html` — Dashboard UI; adds `Watch` tab (`public/index.html:79,506`), watch buttons (`public/index.html:146-152,246,389`), and chart `<iframe>` (`public/index.html:157-237`).
- `test/ping.test.js` — Ping tests; covers unlisted watched-coin exits (`test/ping.test.js:210-232`).
- `test/score.test.js` — Score tests; covers watched-mint vetoes and `watchList` (`test/score.test.js:98-174`).
- `test/server.test.js` — Server/UI tests; covers `/api/watch` and `Watch` tab (`test/server.test.js:249-349`).

## API contracts
- `GET /api/watch` → `200 { coins: WatchedCoin[] }` (`src/server.js:18`; shape at `src/score.js:223-243`: `{ mint, added_ts, symbol, name, creator, pool, price_usd, mcap_usd, liquidity_usd, score, band, ts, vetoes, unknowns, scoreReasons, status, label, reasons, alerts }`).
- `POST /api/watch?mint=<b58>` → `400 { error }` if `!B58.test(mint)` (`src/server.js:54`, `src/wallets.js:3`); else inserts, calls `onWatch(mint)`, returns `200 { ok: true, coins }` (`src/server.js:55-61`).
- `DELETE /api/watch?mint=<b58>` → `400 { error }` if `!B58.test(mint)` (`src/server.js:54`); else deletes, returns `200 { ok: true, coins }` (`src/server.js:58-61`).

## Test entry points
- `test/ping.test.js` — `node --test test/ping.test.js`
- `test/score.test.js` — `node --test test/score.test.js`
- `test/server.test.js` — `node --test test/server.test.js`
- All — `node --test`

## Acceptance criteria
1. `POST /api/watch?mint=<mint>` and `DELETE /api/watch?mint=<mint>` add and remove watched mints, invalid mints return `400`, and `POST` to other routes still returns `405` (`node --test test/server.test.js`).
2. `runCandidates` places watched mints first and evaluates all vetoes on watched mints even when a cheap veto trips (`node --test test/score.test.js`).
3. `deployerWallets` and `checkExits` monitor watched mints even when `listed = 0` or older than 24 hours (`node --test test/ping.test.js`).
4. `watchList` and `GET /api/watch` classify watched coins into `safe` (`Safe to hold`), `caution` (`Caution`), or `flag` (`Red flag`) with plain-English reasons, latest pool data, and per-coin ping alerts (`node --test test/score.test.js test/server.test.js`).
5. The dashboard `Watch` tab renders watched coins, toggles the embedded DexScreener candle chart `<iframe>` while preserving open chart state across refreshes, and never assigns `innerHTML` (`node --test test/server.test.js`).
6. Full test suite passes with zero network calls (`node --test`).
7. Record Updates in `.agents/RECORD.md`: amend `- (ping) Exit alerts are raised for listed and watched tokens on tracked-wallet sells, deployer sells and sharp liquidity drops.` and add `- (watch) Watched tokens are managed from the dashboard and persisted to SQLite.` and `- (watch) Each watched token carries a hold status derived from its latest safety vetoes, exit alerts and score.`
8. manual: Start the server with npm start, watch a live Solana mint in the Watch tab, and click "Show chart" to verify the live DexScreener candle iframe loads in your browser. (outside automated verification)

## Do not re-derive
- `status: 'flag'` triggers on non-`age` vetoes or 24h `exit_deployer`/`exit_liquidity`; `age` veto alone, `exit_wallet`/`exit_divergence`, `!cand`, `score < 45`, or `unknowns.length > 0` yields `'caution'` (`src/score.js:204-211`).
- Vetoed watched mints save `listed: 0` (`src/score.js:143`), staying out of `runningNow` (`src/score.js:164`) while recording merged `vetoes`/`unknowns` (`src/score.js:141-142`).
- Host check (`src/server.js:49`) precedes `/api/watch` (`src/server.js:52`); other non-`GET` routes return `405` (`src/server.js:63`).
- Chart `<iframe>` mounts lazily via `openCharts` (`public/index.html:133,171-192`) using `c.pool || c.mint` (`public/index.html:173`).

## Diff
Split by file group (budget <= 2,200 words):
- Backend (`src/db.js`, `src/main.js`, `src/ping.js`, `src/score.js`, `src/server.js`): inline below.
- UI + Record (`.agents/RECORD.md`, `public/index.html`): `.plans/watch-coins/diff-ui.patch`.
- Tests (`test/*.test.js`): `.plans/watch-coins/diff-tests.patch`.

```diff
diff --git a/src/db.js b/src/db.js
index aa34f16..c019089 100644
--- a/src/db.js
+++ b/src/db.js
@@ -20,0 +21 @@ CREATE TABLE IF NOT EXISTS pending_sigs(sig PRIMARY KEY, wallet, cycles);
+CREATE TABLE IF NOT EXISTS watched_coins(mint PRIMARY KEY, added_ts);
diff --git a/src/main.js b/src/main.js
index b83df97..50b5a1f 100755
--- a/src/main.js
+++ b/src/main.js
@@ -8 +8 @@ import { sampleNewPools, snapTrending, rollHourly, last } from './market.js';
-import { runWalletCycle, deployerWallets } from './ping.js';
+import { runWalletCycle, deployerWallets, checkExits } from './ping.js';
@@ -44 +44,6 @@ function every(name, ms, fn) {
-const server = await startServer({ db, config, tracer, wallets: walletList, now });
+const onWatch = () => {
+  runCandidates({ db, deps: { dexGet, geckoGet, rugGet, rpc }, tracked: walletList().map((w) => w.address), now, config })
+    .then(() => checkExits({ db, tracked: walletList().map((w) => w.address), now: now(), config }))
+    .catch((e) => console.error('watch:', e.message));
+};
+const server = await startServer({ db, config, tracer, wallets: walletList, onWatch, now });
diff --git a/src/ping.js b/src/ping.js
index 4dfc799..218b32b 100644
--- a/src/ping.js
+++ b/src/ping.js
@@ -98 +98 @@ export async function runWalletCycle({ db, rpc, tracked, deployers = [], solUsd,
-// Deployers of the 20 best candidates listed in the last 24 h (watched for their own sells).
+// Deployers of the 20 best candidates listed in the last 24 h plus watched coins (watched for their own sells).
@@ -100 +100 @@ export function deployerWallets(db, now) {
-  return db.prepare(
+  const top = db.prepare(
@@ -103,0 +104,3 @@ export function deployerWallets(db, now) {
+  const watched = db.prepare(
+    'SELECT t.creator FROM watched_coins w JOIN tokens t ON t.mint = w.mint WHERE t.creator IS NOT NULL').all().map((r) => r.creator);
+  return [...new Set([...top, ...watched])];
@@ -106 +109 @@ export function deployerWallets(db, now) {
-// Exit alerts for mints listed in the last 24 h. Deduped per kind, mint, wallet and hour.
+// Exit alerts for mints listed in the last 24 h or in watched_coins. Deduped per kind, mint, wallet and hour.
@@ -110 +113,5 @@ export function checkExits({ db, tracked, now, config = defaultConfig }) {
-    `SELECT DISTINCT c.mint, t.creator FROM candidates c LEFT JOIN tokens t ON t.mint = c.mint WHERE c.listed = 1 AND c.ts > ?`).all(nowS - 86400);
+    `SELECT m.mint, t.creator FROM (
+       SELECT DISTINCT mint FROM candidates WHERE listed = 1 AND ts > ?
+       UNION
+       SELECT mint FROM watched_coins
+     ) m LEFT JOIN tokens t ON t.mint = m.mint`).all(nowS - 86400);
diff --git a/src/score.js b/src/score.js
index 089fb9d..c088612 100644
--- a/src/score.js
+++ b/src/score.js
@@ -78,0 +79,4 @@ function saveCandidate(db, ts, mint, m, { score, band, listed, vetoes, reasons =
+export function watchedMints(db) {
+  return db.prepare('SELECT mint FROM watched_coins ORDER BY added_ts DESC').all().map((r) => r.mint);
+}
+
@@ -85 +89,3 @@ export async function runCandidates({ db, deps, tracked = [], now, config = defa
-  // 1. Universe, tracked-wallet mints first, capped at 60.
+  // 1. Universe, watched mints and tracked-wallet mints first, capped at 60.
+  const watched = watchedMints(db);
+  const watchedSet = new Set(watched);
@@ -93 +99 @@ export async function runCandidates({ db, deps, tracked = [], now, config = defa
-  const universe = [...new Set([...tr, ...trending, ...extra])].filter(Boolean).slice(0, 60);
+  const universe = [...new Set([...watched, ...tr, ...trending, ...extra])].filter(Boolean).slice(0, 60);
@@ -120 +126 @@ export async function runCandidates({ db, deps, tracked = [], now, config = defa
-    // 4. Cheap vetoes first.
+    // 4. Cheap vetoes first (watched mints continue to full veto evaluation).
@@ -122 +128 @@ export async function runCandidates({ db, deps, tracked = [], now, config = defa
-    if (cheap.vetoes.length) { saveCandidate(db, nowS, mint, m, { score: 0, band: 'avoid', listed: 0, vetoes: cheap.vetoes, unknowns: cheap.unknowns }); continue; }
+    if (cheap.vetoes.length && !watchedSet.has(mint)) { saveCandidate(db, nowS, mint, m, { score: 0, band: 'avoid', listed: 0, vetoes: cheap.vetoes, unknowns: cheap.unknowns }); continue; }
@@ -135 +141 @@ export async function runCandidates({ db, deps, tracked = [], now, config = defa
-    const vetoes = rest.vetoes;
+    const vetoes = [...new Set([...cheap.vetoes, ...rest.vetoes])];
@@ -160,0 +167,79 @@ export function runningNow(db, now) {
+
+const VETO_REASONS = {
+  mint_authority: 'Mint authority is still active (new tokens can be minted)',
+  freeze_authority: 'Freeze authority is still active (wallets can be frozen)',
+  rugged: 'Flagged as rugged or high danger by RugCheck',
+  transfer_fee: 'Token charges a transfer fee',
+  lp_unlocked: 'Liquidity pool is not sufficiently locked',
+  top10: 'Top 10 holders own too much of the supply',
+  insiders: 'Insider wallets hold too much of the supply',
+  liquidity: 'Pool liquidity is below the safety minimum',
+  age: 'Coin is newer than the minimum age threshold',
+  wash: 'Suspected wash trading (high volume with too few buyers)',
+};
+
+const EXIT_REASONS = {
+  exit_deployer: 'Creator wallet sold or moved tokens in the last 24 hours',
+  exit_liquidity: 'Sharp liquidity drop detected in the last 24 hours',
+  exit_wallet: 'Tracked wallet sold this coin in the last 24 hours',
+  exit_divergence: 'Volume rose while unique buyers fell in the last 24 hours',
+};
+
+export function watchList(db, now, config = defaultConfig) {
+  const nowS = Math.floor(now / 1000);
+  const rows = db.prepare('SELECT mint, added_ts FROM watched_coins ORDER BY added_ts DESC').all();
+  const getTok = db.prepare('SELECT symbol, name, creator FROM tokens WHERE mint = ?');
+  const getSnap = db.prepare('SELECT pool, symbol, name, price_usd, mcap_usd, liquidity_usd, ts FROM pool_snapshots WHERE mint = ? ORDER BY ts DESC LIMIT 1');
+  const getCand = db.prepare('SELECT ts, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd FROM candidates WHERE mint = ? ORDER BY id DESC LIMIT 1');
+  const getAlerts = db.prepare('SELECT ts, kind, mint, wallet, detail FROM alerts WHERE mint = ? ORDER BY ts DESC, id DESC LIMIT 50');
+
+  return rows.map(({ mint, added_ts }) => {
+    const tok = getTok.get(mint);
+    const snap = getSnap.get(mint);
+    const cand = getCand.get(mint);
+    const alerts = getAlerts.all(mint).map((a) => ({ ...a, detail: JSON.parse(a.detail || '{}') }));
+    const vetoes = cand ? JSON.parse(cand.vetoes || '[]') : [];
+    const unknowns = cand ? JSON.parse(cand.unknowns || '[]') : [];
+    const scoreReasons = cand ? JSON.parse(cand.reasons || '[]') : [];
+    const recent = alerts.filter((a) => a.ts > nowS - 86400);
+    const hasAlert = (k) => recent.some((a) => a.kind === k);
+
+    const flagVetoes = vetoes.filter((v) => v !== 'age');
+    const isFlag = flagVetoes.length > 0 || hasAlert('exit_deployer') || hasAlert('exit_liquidity');
+    const isCaution = !isFlag && (!cand || hasAlert('exit_wallet') || hasAlert('exit_divergence') || vetoes.includes('age') || cand.score < 45 || unknowns.length > 0);
+    const status = isFlag ? 'flag' : isCaution ? 'caution' : 'safe';
+    const label = status === 'flag' ? 'Red flag' : status === 'caution' ? 'Caution' : 'Safe to hold';
+
+    const reasons = [];
+    if (!cand) reasons.push('Waiting for first safety scan');
+    for (const v of vetoes) reasons.push(VETO_REASONS[v] || `Safety check failed: ${v}`);
+    for (const k of ['exit_deployer', 'exit_liquidity', 'exit_wallet', 'exit_divergence']) {
+      if (hasAlert(k)) reasons.push(EXIT_REASONS[k]);
+    }
+    if (cand && !vetoes.length && cand.score < 45) reasons.push(`Score is low (${cand.score}/100)`);
+    if (cand && unknowns.length > 0) reasons.push(`Missing safety or market data: ${unknowns.join(', ')}`);
+    if (!reasons.length) reasons.push('Passed all safety checks with no recent exit alerts');
+
+    return {
+      mint,
+      added_ts,
+      symbol: tok?.symbol ?? snap?.symbol ?? null,
+      name: tok?.name ?? snap?.name ?? null,
+      creator: tok?.creator ?? null,
+      pool: snap?.pool ?? null,
+      price_usd: snap?.price_usd ?? cand?.price_usd ?? null,
+      mcap_usd: snap?.mcap_usd ?? cand?.mcap_usd ?? null,
+      liquidity_usd: snap?.liquidity_usd ?? null,
+      score: cand ? cand.score : null,
+      band: cand ? cand.band : null,
+      ts: cand ? cand.ts : null,
+      vetoes,
+      unknowns,
+      scoreReasons,
+      status,
+      label,
+      reasons,
+      alerts,
+    };
+  });
+}
diff --git a/src/server.js b/src/server.js
index ebdafc0..909d2e9 100644
--- a/src/server.js
+++ b/src/server.js
@@ -5 +5 @@ import { recentHourly, trenchIndex } from './market.js';
-import { runningNow } from './score.js';
+import { runningNow, watchList } from './score.js';
@@ -11,2 +11,2 @@ const PAGE = new URL('../public/index.html', import.meta.url);
-// deps: {db, config, tracer: {start(wallet), get(wallet)}, wallets: () => [{address,label}], now}
-export function createServer({ db, config, tracer, wallets = () => [], now = Date.now }) {
+// deps: {db, config, tracer: {start(wallet), get(wallet)}, wallets: () => [{address,label}], onWatch, now}
+export function createServer({ db, config, tracer, wallets = () => [], onWatch = () => {}, now = Date.now }) {
@@ -17,0 +18 @@ export function createServer({ db, config, tracer, wallets = () => [], now = Dat
+    '/api/watch': () => ({ coins: watchList(db, now(), config) }),
@@ -49 +49,0 @@ export function createServer({ db, config, tracer, wallets = () => [], now = Dat
-    if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
@@ -51,0 +52,12 @@ export function createServer({ db, config, tracer, wallets = () => [], now = Dat
+      if (url.pathname === '/api/watch' && (req.method === 'POST' || req.method === 'DELETE')) {
+        const mint = url.searchParams.get('mint') ?? '';
+        if (!B58.test(mint)) return send(400, { error: 'invalid mint address' });
+        if (req.method === 'POST') {
+          db.prepare('INSERT OR IGNORE INTO watched_coins(mint, added_ts) VALUES (?,?)').run(mint, Math.floor(now() / 1000));
+          onWatch(mint);
+        } else {
+          db.prepare('DELETE FROM watched_coins WHERE mint = ?').run(mint);
+        }
+        return send(200, { ok: true, coins: watchList(db, now(), config) });
+      }
+      if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
```
