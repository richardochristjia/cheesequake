# Context pack

BASE: watch-coins (93235cd)
CHANGED: 4 files, +197/-16

## What this change does
Enriches `/api/ping` and `/api/watch` alerts with registered wallet labels (`wallet_label` and `consensus` `detail.wallet_labels`), adds `?wallet=<address>` filtering to `/api/ping` (direct + `consensus` alerts), and updates the **Ping** and **Watch** UI tabs to render wallet labels and filter **Ping** activity by wallet.

## Files
- `src/score.js` — Exports `enrichAlert(a, labelOf)` (`src/score.js:198-209`) and extends `watchList(db, now, config, wallets = [])` (`src/score.js:211-228`) to enrich per-coin alerts.
- `src/server.js` — Passes `wallets()` to `watchList` (`src/server.js:18`, `src/server.js:75`) and updates `GET /api/ping` (`src/server.js:19-39`) to validate `?wallet=` (`B58`), filter direct + `consensus` alerts, enrich alerts, and return `wallets`.
- `public/index.html` — Adds `walletCell`, `consensusWallets`, and `alertWalletCell` (`public/index.html:108-121`), renders them in Watch (`public/index.html:213`) and Ping (`public/index.html:347`), and adds `<select aria-label="Wallet">` to Ping (`public/index.html:332-346`).
- `test/server.test.js` — Extends `loadDashboard` (`test/server.test.js:168-187`) and adds API + VM tests (`test/server.test.js:195-320`).

## API contracts
- `GET /api/ping?kind=<kind>&wallet=<address>` (`src/server.js:19-39`) → `200 { alerts, wallets }` or `400 { error: 'invalid wallet address' }` when `wallet` fails `B58` (`src/wallets.js:3`). Alert shape declared in `src/score.js:198-209`: `{ ...alert, wallet_label: string|null, detail: object & { wallet_labels?: Record<string, string> } }`.
- `GET|POST|DELETE /api/watch` (`src/server.js:18`, `src/server.js:66-76`) → `200 { coins }`; each coin's `alerts` enriched by `enrichAlert` (`src/score.js:228`).

## Test entry points
- `test/server.test.js` — `node --test test/server.test.js` (full suite: `npm test`)

## Acceptance criteria
1. `/api/ping` includes `wallets` (`[{ address, label }]`) and enriches each returned alert with `wallet_label` (string or `null`) and `detail.wallet_labels` (`{ [address]: label }` for `consensus` alerts) (checked by `test/server.test.js`).
2. `/api/ping?wallet=<address>` returns only alerts where `wallet === <address>` or `kind === 'consensus'` with `<address>` in `detail.wallets`, combinable with `?kind=`, and returns HTTP `400` `{ error: 'invalid wallet address' }` when `wallet` is not valid base58 (checked by `test/server.test.js`).
3. `/api/watch` enriches each watched coin's `alerts` with `wallet_label` and `detail.wallet_labels` from the registered wallet list (checked by `test/server.test.js`).
4. The **Ping** tab renders a wallet `<select>` filter next to the kind `<select>`, preserves the selected wallet across refreshes, requests `/api/ping` with `wallet=<address>`, and displays registered wallet user names alongside address links in the Wallet column and on `consensus` alerts (checked by `test/server.test.js`).
5. The **Watch** tab's per-coin alert tables display registered wallet user names alongside address links and on `consensus` alerts (checked by `test/server.test.js`).
6. All unit and integration tests pass via `npm test`, and `public/index.html` uses only safe DOM construction with no `innerHTML` or string markup assignment (checked by `npm test`).

## Do not re-derive
- `consensus` rows store `wallet = null` in SQLite (`src/alerts.js`); addresses are in JSON `detail.wallets`. When `wallet` is set, `/api/ping` queries `(a.wallet = ? OR a.kind = 'consensus')` without SQL `LIMIT 200` (`src/server.js:27-30`), then filters `a.detail.wallets.includes(wallet)` in JS before `.slice(0, 200)` (`src/server.js:36-37`).
- `loadWallets` (`src/wallets.js:22`) sets `label: null` for unlabeled wallets; `labelOf` omits null labels (`src/score.js:213`, `src/server.js:33`).
- `h()` (`public/index.html:18`) flattens nested arrays and wraps strings in `document.createTextNode`, so `[label + ' ', link(address)]` is safe DOM construction.

## Diff (source files: `public/index.html`, `src/score.js`, `src/server.js`; test diff in `test/server.test.js:168-320` split to fit 2,200-word budget)
```diff
diff --git a/public/index.html b/public/index.html
index ebccd67..89ac81d 100644
--- a/public/index.html
+++ b/public/index.html
@@ -105,6 +105,20 @@ const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
 const fmt = (n, d = 0) => (n === null || n === undefined ? 'unknown' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
 const when = (ts) => new Date(ts * 1000).toLocaleString();
 const link = (a) => (B58.test(a || '') ? h('a', { href: 'https://solscan.io/account/' + a, target: '_blank', rel: 'noopener noreferrer' }, short(a)) : short(a));
+const walletCell = (address, label) => (!address ? '' : label ? [label + ' ', link(address)] : link(address));
+function consensusWallets(a) {
+  const d = a.detail || {};
+  const ws = Array.isArray(d.wallets) ? d.wallets : [];
+  const labels = d.wallet_labels || {};
+  const out = [];
+  ws.forEach((w, i) => {
+    if (i) out.push(', ');
+    if (labels[w]) out.push(labels[w] + ' ', link(w));
+    else out.push(link(w));
+  });
+  return out;
+}
+const alertWalletCell = (a) => (a.wallet ? walletCell(a.wallet, a.wallet_label) : a.kind === 'consensus' ? consensusWallets(a) : '');
 const card = (title, ...kids) => h('div', { class: 'card' }, h('h2', {}, title), ...kids);
 const table = (head, rows) => h('table', {}, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))));
 const get = async (p) => (await fetch(p)).json();
@@ -196,7 +210,7 @@ function updateWatchedCoinCard(entry, c) {
     h('span', {}, 'Liquidity: ' + liqTxt));
   entry.alertsWrap.replaceChildren(
     alerts.length
-      ? table(['Time', 'Kind', 'Wallet', 'Detail'], alerts.map((a) => [when(a.ts), a.kind, a.wallet ? link(a.wallet) : '', detail(a)]))
+      ? table(['Time', 'Kind', 'Wallet', 'Detail'], alerts.map((a) => [when(a.ts), a.kind, alertWalletCell(a), detail(a)]))
       : h('p', { class: 'mut' }, 'No alerts for this coin yet.'));
 }
 
@@ -315,13 +329,22 @@ async function watch() {
 }
 
 let pingKind = '';
+let pingWallet = '';
 async function ping() {
-  const [d] = await Promise.all([get('/api/ping' + (pingKind ? '?kind=' + encodeURIComponent(pingKind) : '')), ensureWatched()]);
+  const params = [];
+  if (pingKind) params.push('kind=' + encodeURIComponent(pingKind));
+  if (pingWallet) params.push('wallet=' + encodeURIComponent(pingWallet));
+  const [d] = await Promise.all([get('/api/ping' + (params.length ? '?' + params.join('&') : '')), ensureWatched()]);
   const sel = h('select', { 'aria-label': 'Alert kind' }, ['', 'buy', 'sell', 'consensus', 'exit'].map((k) => h('option', { value: k }, k || 'all')));
   sel.value = pingKind;
-  sel.onchange = () => { pingKind = sel.value; ping(); };
-  put('ping', card('Wallet activity', sel, d.alerts.length ? table(['Time', 'Kind', 'Coin', 'Wallet', 'Detail', ''],
-    d.alerts.map((a) => [when(a.ts), a.kind, [a.symbol ? a.symbol + ' ' : '', link(a.mint)], a.wallet ? link(a.wallet) : '', detail(a), watchBtn(a.mint, ping)]))
+  sel.onchange = () => { pingKind = sel.value; return ping(); };
+  const wsel = h('select', { 'aria-label': 'Wallet' },
+    h('option', { value: '' }, 'all wallets'),
+    ...(d.wallets || []).map((w) => h('option', { value: w.address }, w.label ? w.label + ' (' + short(w.address) + ')' : short(w.address))));
+  wsel.value = pingWallet;
+  wsel.onchange = () => { pingWallet = wsel.value; return ping(); };
+  put('ping', card('Wallet activity', sel, ' ', wsel, d.alerts.length ? table(['Time', 'Kind', 'Coin', 'Wallet', 'Detail', ''],
+    d.alerts.map((a) => [when(a.ts), a.kind, [a.symbol ? a.symbol + ' ' : '', link(a.mint)], alertWalletCell(a), detail(a), watchBtn(a.mint, ping)]))
     : h('p', { class: 'mut' }, 'No alerts yet.')));
 }
 function detail(a) {
diff --git a/src/score.js b/src/score.js
index 74fb6db..2c1f1ec 100644
--- a/src/score.js
+++ b/src/score.js
@@ -195,8 +195,22 @@ function exitReason(k, d = {}) {
   return k;
 }
 
-export function watchList(db, now, config = defaultConfig) {
+export function enrichAlert(a, labelOf) {
+  const detail = typeof a.detail === 'string' ? JSON.parse(a.detail || '{}') : { ...(a.detail || {}) };
+  if (a.kind === 'consensus') {
+    const wallet_labels = {};
+    for (const w of Array.isArray(detail.wallets) ? detail.wallets : []) {
+      const l = labelOf.get(w);
+      if (l) wallet_labels[w] = l;
+    }
+    detail.wallet_labels = wallet_labels;
+  }
+  return { ...a, wallet_label: (a.wallet && labelOf.get(a.wallet)) || null, detail };
+}
+
+export function watchList(db, now, config = defaultConfig, wallets = []) {
   const nowS = Math.floor(now / 1000);
+  const labelOf = wallets instanceof Map ? wallets : new Map((wallets || []).filter((w) => w?.label).map((w) => [w.address, w.label]));
   const rows = db.prepare('SELECT mint, added_ts FROM watched_coins ORDER BY added_ts DESC').all();
   const getTok = db.prepare('SELECT symbol, name, creator FROM tokens WHERE mint = ?');
   const getSnap = db.prepare('SELECT pool, symbol, name, price_usd, mcap_usd, liquidity_usd, ts FROM pool_snapshots WHERE mint = ? ORDER BY ts DESC LIMIT 1');
@@ -211,7 +225,7 @@ export function watchList(db, now, config = defaultConfig) {
     const cand = getCand.get(mint);
     const repRow = getRep.get(mint);
     const rep = repRow ? JSON.parse(repRow.json || 'null') : null;
-    const alerts = getAlerts.all(mint).map((a) => ({ ...a, detail: JSON.parse(a.detail || '{}') }));
+    const alerts = getAlerts.all(mint).map((a) => enrichAlert(a, labelOf));
     const exitByKind = new Map();
     for (const r of getExits.all(mint, nowS - 86400)) {
       if (!exitByKind.has(r.kind)) exitByKind.set(r.kind, JSON.parse(r.detail || '{}'));
diff --git a/src/server.js b/src/server.js
index 909d2e9..ab014f0 100644
--- a/src/server.js
+++ b/src/server.js
@@ -2,7 +2,7 @@ import http from 'node:http';
 import { readFileSync } from 'node:fs';
 import { B58 } from './wallets.js';
 import { recentHourly, trenchIndex } from './market.js';
-import { runningNow, watchList } from './score.js';
+import { runningNow, watchList, enrichAlert } from './score.js';
 import { scorecardFor } from './scorecard.js';
 import { calibration } from './outcomes.js';
 
@@ -15,13 +15,27 @@ export function createServer({ db, config, tracer, wallets = () => [], onWatch =
       const hourly = recentHourly(db, config.index.windowHours);
       return { index: trenchIndex(hourly), hours: hourly.length, warmupHours: config.index.warmupHours, hourly };
     },
-    '/api/watch': () => ({ coins: watchList(db, now(), config) }),
+    '/api/watch': () => ({ coins: watchList(db, now(), config, wallets()) }),
     '/api/ping': (q) => {
       const kind = q.get('kind');
-      const where = !kind ? '' : kind === 'exit' ? "WHERE kind LIKE 'exit\\_%' ESCAPE '\\'" : 'WHERE kind = ?';
-      const rows = db.prepare(`SELECT a.ts, a.kind, a.mint, a.wallet, a.detail, t.symbol, t.name FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint ${where} ORDER BY a.ts DESC, a.id DESC LIMIT 200`)
-        .all(...(kind && kind !== 'exit' ? [kind] : []));
-      return { alerts: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail || '{}') })) };
+      const wallet = q.get('wallet') ?? '';
+      if (wallet && !B58.test(wallet)) return [400, { error: 'invalid wallet address' }];
+      const clauses = [];
+      const params = [];
+      if (kind === 'exit') clauses.push("a.kind LIKE 'exit\\_%' ESCAPE '\\'");
+      else if (kind) { clauses.push('a.kind = ?'); params.push(kind); }
+      if (wallet) { clauses.push("(a.wallet = ? OR a.kind = 'consensus')"); params.push(wallet); }
+      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
+      const limit = wallet ? '' : 'LIMIT 200';
+      const rows = db.prepare(`SELECT a.ts, a.kind, a.mint, a.wallet, a.detail, t.symbol, t.name FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint ${where} ORDER BY a.ts DESC, a.id DESC ${limit}`)
+        .all(...params);
+      const wl = wallets();
+      const labelOf = new Map(wl.filter((w) => w?.label).map((w) => [w.address, w.label]));
+      const alerts = rows
+        .map((r) => enrichAlert(r, labelOf))
+        .filter((a) => !wallet || a.wallet === wallet || (a.kind === 'consensus' && Array.isArray(a.detail.wallets) && a.detail.wallets.includes(wallet)))
+        .slice(0, 200);
+      return { alerts, wallets: wl };
     },
     '/api/narratives': () => {
       const hour = Math.floor(now() / 1000 / 3600) * 3600;
@@ -58,7 +72,7 @@ export function createServer({ db, config, tracer, wallets = () => [], onWatch =
         } else {
           db.prepare('DELETE FROM watched_coins WHERE mint = ?').run(mint);
         }
-        return send(200, { ok: true, coins: watchList(db, now(), config) });
+        return send(200, { ok: true, coins: watchList(db, now(), config, wallets()) });
       }
       if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
       if (url.pathname === '/') return send(200, readFileSync(PAGE, 'utf8'), 'text/html');
```
