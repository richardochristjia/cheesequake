#!/usr/bin/env node
// Offline backtest: replays every scan in the DB (read-only) and prices what came next from cached
// GeckoTerminal 5-minute candles. Usage: node scripts/backtest.js [--offline] [--draws=1000] [--until=<ISO time>]
// --until freezes the dataset (scans, controls) at that time, so a rerun matches the candle cache while the live scanner keeps writing.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';
import { createClient } from '../src/http.js';
import { opportunityRisk } from '../src/score.js';
import { top10Pct } from '../src/vetoes.js';

const CACHE = 'data/ohlcv';
const FEES = 0.01; // round trip
const TRADE_USD = 200;
const DEAD_GAP_S = 2 * 3600;
const ENTRY_MAX_DELAY_S = 600; // no candle within 10 min of the scan: the scan price is not tradable, so do not price it
const CANDLE_LIMIT = 1000;
const GECKO_GAP_MS = 7000; // the free OHLCV endpoint answers about 10 calls a minute; 3s pacing mostly gets 429s
export const LABEL_SETS = [
  { id: 'a1h', up: 0.3, dn: 0.2, h: 1 }, { id: 'a6h', up: 0.3, dn: 0.2, h: 6 },
  { id: 'b1h', up: 1, dn: 0.5, h: 1 }, { id: 'b6h', up: 1, dn: 0.5, h: 6 },
];
const PRIMARY = 'a1h';

// ---------- pure helpers (exported for tests) ----------

// Candles are [ts, open, high, low, close, volume] sorted oldest first. Returns {kind, ret}:
// kind is win | loss | drift | dead | unpriced | open; ret is net of costs.
export function label(candles, { scanTs, liquidity, up, dn, h, dataEnd = Infinity }) {
  const end = scanTs + h * 3600;
  if (end > dataEnd) return { kind: 'open' };
  const win = candles.filter((c) => c[0] >= scanTs && c[0] < end);
  if (!win.length || win[0][0] > scanTs + ENTRY_MAX_DELAY_S || !(liquidity > 0) || !(win[0][1] > 0)) return { kind: 'unpriced' };
  const entry = win[0][1];
  const cost = FEES + (2 * TRADE_USD) / liquidity;
  let first = null;
  for (const c of win) {
    if (c[3] <= entry * (1 - dn)) { first = 'loss'; break; } // both in one candle counts as the loss
    if (c[2] >= entry * (1 + up)) { first = 'win'; break; }
  }
  if (first === 'win') return { kind: 'win', ret: Math.max(-1, up - cost) };
  // Dead: at or under half the entry price, then no candle for 2h. A rug cannot be exited at the barrier.
  for (let i = candles.indexOf(win[0]); i < candles.length && candles[i][0] < end; i++) {
    if (candles[i][4] > entry / 2) continue;
    const gap = (candles[i + 1]?.[0] ?? dataEnd) - candles[i][0];
    if (gap >= DEAD_GAP_S) return { kind: 'dead', ret: -1 };
  }
  if (first === 'loss') return { kind: 'loss', ret: Math.max(-1, -dn - cost) };
  return { kind: 'drift', ret: Math.max(-1, win.at(-1)[4] / entry - 1 - cost) };
}

// First scan of each mint in each clock hour.
export function dedupeHourly(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = `${r.mint}:${Math.floor(r.ts / 3600)}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function ranks(xs) {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

export function spearman(xs, ys) {
  if (xs.length < 3) return null;
  const a = ranks(xs), b = ranks(ys), ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa === 0 || sbb === 0 ? null : sab / Math.sqrt(saa * sbb);
}

// Five groups of items ordered by key(item), as equal in size as ties of position allow.
export function quintiles(items, key) {
  const s = [...items].sort((a, b) => key(a) - key(b));
  const q = [[], [], [], [], []];
  s.forEach((it, i) => q[Math.floor((i * 5) / s.length)].push(it));
  return q;
}

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 95% interval of stat(rows) from resampling mints (every event of a drawn mint comes along).
export function bootstrap(rows, stat, draws, seed = 1) {
  const byMint = new Map();
  for (const r of rows) (byMint.get(r.mint) ?? byMint.set(r.mint, []).get(r.mint)).push(r);
  const groups = [...byMint.values()];
  if (groups.length < 2 || !draws) return null;
  const rand = rng(seed), out = [];
  for (let d = 0; d < draws; d++) {
    const pick = [];
    for (let i = 0; i < groups.length; i++) pick.push(...groups[Math.floor(rand() * groups.length)]);
    const v = stat(pick);
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  if (out.length < draws / 2) return null;
  out.sort((a, b) => a - b);
  return [out[Math.floor(0.025 * out.length)], out[Math.min(out.length - 1, Math.floor(0.975 * out.length))]];
}

// ---------- data ----------

const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export function rawInputs(m) {
  const ts = m.ts;
  return {
    surge: div(m.buyers_h1, div(m.buyers_h6, 6)),
    buyShare: div(m.buys_h1, (m.buys_h1 ?? 0) + (m.sells_h1 ?? 0)),
    volPace: div(m.vol_h1, div(m.vol_h6, 6)),
    chg_h1: m.chg_h1 ?? null,
    chg_m5: m.chg_m5 ?? null,
    depth: div(m.liquidity_usd, m.mcap_usd),
    liquidity: m.liquidity_usd ?? null,
    mcap: m.mcap_usd ?? null,
    ageH: m.created_at == null ? null : (ts - m.created_at) / 3600,
    buyers: m.buyers_h1 ?? null,
  };
}

function loadEvents(db, until) {
  const rows = dedupeHourly(db.prepare('SELECT id, ts, mint, score, band, listed, vetoes, reasons, unknowns FROM candidates WHERE ts <= ? ORDER BY ts, id').all(until));
  const snap = db.prepare("SELECT * FROM pool_snapshots WHERE mint = ? AND ts = ? AND source = 'candidate' ORDER BY rowid DESC LIMIT 1");
  const peakQ = db.prepare('SELECT MAX(price_usd) p FROM pool_snapshots WHERE mint = ? AND pool IS ? AND ts BETWEEN ? AND ?');
  const reportQ = db.prepare('SELECT json FROM reports WHERE mint = ?');
  const reports = new Map();
  const events = [];
  for (const r of rows) {
    const m = snap.get(r.mint, r.ts);
    if (!m?.pool) continue;
    if (!reports.has(r.mint)) reports.set(r.mint, parse(reportQ.get(r.mint)?.json, null));
    const report = reports.get(r.mint);
    const unknowns = parse(r.unknowns, []);
    const peak = peakQ.get(r.mint, m.pool, r.ts - config.drawdown.windowMinutes * 60, r.ts).p;
    const or = opportunityRisk({ market: m, report, peak, unknowns, config });
    const parts = {};
    for (const p of parse(r.reasons, [])) parts[p.part] = p.max ? p.points / p.max : null;
    const supply = report?.supply;
    events.push({
      mint: r.mint, pool: m.pool, ts: r.ts, listed: !!r.listed, score: r.listed ? r.score : null, band: r.band,
      vetoes: parse(r.vetoes, []), parts, liquidity: m.liquidity_usd, in: rawInputs(m),
      opportunity: or.opportunity, risk: or.risk,
      leaky: { top10: top10Pct(report), insider: supply ? (report.insiderHolding / supply) * 100 : null, lpLocked: report?.lpLockedPct ?? null },
    });
  }
  return events;
}

function mulberryShuffle(list, seed) {
  const rand = rng(seed), a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function pickControls(db, events, until, n = 200) {
  const used = new Set(events.map((e) => e.pool)), mints = new Set(events.map((e) => e.mint));
  const all = db.prepare(`SELECT pool, mint, created_at, liquidity_usd FROM pool_snapshots
    WHERE rowid IN (SELECT MIN(rowid) FROM pool_snapshots WHERE source = 'new' AND pool IS NOT NULL AND ts <= ? GROUP BY pool)`).all(until)
    .filter((r) => !used.has(r.pool) && !mints.has(r.mint) && r.created_at != null && r.liquidity_usd > 0)
    .sort((a, b) => (a.pool < b.pool ? -1 : 1));
  return mulberryShuffle(all, 42).slice(0, n).map((r) => ({
    mint: r.mint, pool: r.pool, ts: r.created_at + 300, listed: false, control: true, liquidity: r.liquidity_usd, vetoes: [], parts: {}, in: {}, leaky: {},
  }));
}

// ---------- candles ----------

const cachePath = (pool) => `${CACHE}/${pool}.json`;
const readCache = (pool) => (existsSync(cachePath(pool)) ? parse(readFileSync(cachePath(pool), 'utf8'), null) : null);

async function fetchPools(pools, { offline, log }) {
  const stat = { fetched: 0, cached: 0, failed: 0, missing: 0 };
  mkdirSync(CACHE, { recursive: true });
  let get = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [i, pool] of pools.entries()) {
    if (readCache(pool)) { stat.cached++; continue; }
    if (offline) { stat.missing++; continue; }
    get ??= createClient({ fetch: globalThis.fetch, sleep, now: Date.now, minGapMs: Math.max(config.pace.geckoterminal, GECKO_GAP_MS), retry: config.retry });
    try {
      const body = await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=5&limit=${CANDLE_LIMIT}&currency=usd`);
      const list = body?.data?.attributes?.ohlcv_list;
      if (!Array.isArray(list)) throw new Error('no ohlcv_list');
      const tmp = `${cachePath(pool)}.tmp`; // written whole, then renamed: never a half file
      writeFileSync(tmp, JSON.stringify({ pool, fetchedAt: Math.floor(Date.now() / 1000), list: list.reverse() }));
      renameSync(tmp, cachePath(pool));
      stat.fetched++;
    } catch (e) {
      stat.failed++;
      log(`fail ${pool}: ${e.message}`);
    }
    if ((i + 1) % 25 === 0) log(`fetch ${i + 1}/${pools.length} (${stat.fetched} ok, ${stat.failed} failed)`);
  }
  return stat;
}

// Interleaved (listed, listed, vetoed, control, ...) so that stopping a slow run early still leaves every group sampled.
function fetchOrder(events, controls) {
  const uniq = (xs) => [...new Set(xs.map((e) => e.pool))];
  const l = uniq(events.filter((e) => e.listed)), seen = new Set(l);
  const v = uniq(events.filter((e) => !e.listed)).filter((p) => !seen.has(p)), c = uniq(controls);
  const out = [];
  for (let i = 0; i < Math.max(l.length / 2, v.length, c.length); i++) out.push(...l.slice(2 * i, 2 * i + 2), ...v.slice(i, i + 1), ...c.slice(i, i + 1));
  return [...new Set(out)];
}

// ---------- pricing ----------

export function priceEvents(events, dataEnd, read = readCache) {
  const unpriced = Object.fromEntries(LABEL_SETS.map((s) => [s.id, 0]));
  const open = { ...unpriced };
  for (const e of events) {
    const cache = read(e.pool);
    e.labels = {};
    for (const s of LABEL_SETS) {
      const truncated = cache && cache.list.length >= CANDLE_LIMIT && e.ts < cache.list[0][0]; // history cut off before the scan
      const l = !cache || truncated ? { kind: 'unpriced' } : label(cache.list, { scanTs: e.ts, liquidity: e.liquidity, ...s, dataEnd: Math.min(dataEnd, cache.fetchedAt) }); // candles after the fetch are unknown, not absent
      e.labels[s.id] = l;
      if (l.kind === 'unpriced') unpriced[s.id]++;
      if (l.kind === 'open') open[s.id]++;
    }
  }
  return { unpriced, open };
}

// ---------- report ----------

const pct = (x, d = 0) => (x == null ? 'n/a' : `${(x * 100).toFixed(d)}%`);
const num = (x, d = 2) => (x == null ? 'n/a' : x.toFixed(d));
const mints = (rows) => new Set(rows.map((r) => r.mint)).size;
const thin = (rows) => (mints(rows) < 20 ? ' thin' : '');
const interval = (ci, f = num) => (ci ? `[${f(ci[0])}, ${f(ci[1])}]` : '[n/a]');
const priced = (rows, id) => rows.filter((r) => r.labels[id].ret != null);
const isWin = (id) => (r) => (r.labels[id].kind === 'win' ? 1 : 0);
const retOf = (id) => (r) => r.labels[id].ret;
const corrStat = (xf, id) => (rows) => spearman(rows.map(xf), rows.map(retOf(id)));
const rowsWith = (rows, xf, id) => priced(rows, id).filter((r) => xf(r) != null && Number.isFinite(xf(r)));

function monotone(groups, id) {
  const m = groups.map((g) => mean(g.map(retOf(id))));
  if (m.some((v) => v == null)) return 'n/a';
  return m.every((v, i) => !i || v >= m[i - 1]) ? 'up' : m.every((v, i) => !i || v <= m[i - 1]) ? 'down' : 'no';
}

function metricTable(title, metrics, rows, ctx) {
  const { draws, split } = ctx;
  const out = [`### ${title}`, '',
    `Primary label set \`${PRIMARY}\` (+30% / -20%, 1h). Quintile cells run Q1 (lowest value) to Q5.`, '',
    '| metric | n mints | rho [95% CI] | rho tune | rho test | win% Q1..Q5 | mean ret Q1..Q5 | monotone | tag |', '|---|---|---|---|---|---|---|---|---|'];
  const other = ['', '| metric | ' + LABEL_SETS.filter((s) => s.id !== PRIMARY).map((s) => `rho ${s.id} [95% CI]`).join(' | ') + ' |', '|---|---|---|---|'];
  for (const m of metrics) {
    const r = rowsWith(rows, m.f, PRIMARY);
    const rho = corrStat(m.f, PRIMARY)(r);
    const q = quintiles(r, m.f);
    const sp = (pred) => corrStat(m.f, PRIMARY)(r.filter(pred));
    const tune = r.filter((x) => x.ts <= split), test = r.filter((x) => x.ts > split);
    out.push(`| ${m.name} | ${mints(r)} | ${num(rho)} ${interval(bootstrap(r, corrStat(m.f, PRIMARY), draws))} | ${num(sp((x) => x.ts <= split))} (${mints(tune)}) | ${num(sp((x) => x.ts > split))} (${mints(test)}${mints(test) < 20 ? ' thin' : ''}) | ${q.map((g) => pct(mean(g.map(isWin(PRIMARY))))).join(' ')} | ${q.map((g) => pct(mean(g.map(retOf(PRIMARY))))).join(' ')} | ${monotone(q, PRIMARY)} | ${[m.leaky ? 'leaky' : '', thin(r).trim()].filter(Boolean).join(' ')} |`);
    const cells = LABEL_SETS.filter((s) => s.id !== PRIMARY).map((s) => {
      const rs = rowsWith(rows, m.f, s.id);
      return `${num(corrStat(m.f, s.id)(rs))} ${interval(bootstrap(rs, corrStat(m.f, s.id), draws))} (${mints(rs)} mints)`;
    });
    other.push(`| ${m.name}${m.leaky ? ' (leaky)' : ''} | ${cells.join(' | ')} |`);
  }
  return [...out, ...other, ''].join('\n');
}

function groupTable(title, groups, ctx, controls) {
  const { draws } = ctx;
  const out = [`### ${title}`, ''];
  for (const id of ['a1h', 'a6h']) {
    const c = priced(controls, id);
    out.push(`Label set \`${id}\`. Control: ${c.length} events, win ${pct(mean(c.map(isWin(id))), 1)}, mean ret ${pct(mean(c.map(retOf(id))), 1)}, dead ${pct(mean(c.map((r) => (r.labels[id].kind === 'dead' ? 1 : 0))), 1)}.`, '',
      '| group | n mints | n events | win% [95% CI] | mean ret | dead% | <= -50% | control win% | tag |', '|---|---|---|---|---|---|---|---|---|');
    for (const [name, rows] of groups) {
      const r = priced(rows, id);
      out.push(`| ${name} | ${mints(r)} | ${r.length} | ${pct(mean(r.map(isWin(id))), 1)} ${interval(bootstrap(r, (x) => mean(x.map(isWin(id))), draws), (v) => pct(v, 1))} | ${pct(mean(r.map(retOf(id))), 1)} | ${pct(mean(r.map((x) => (x.labels[id].kind === 'dead' ? 1 : 0))), 1)} | ${pct(mean(r.map((x) => (x.labels[id].ret <= -0.5 ? 1 : 0))), 1)} | ${pct(mean(c.map(isWin(id))), 1)} | ${thin(r).trim()} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function composites(listed, ctx) {
  const { draws, split } = ctx;
  const inputs = [['surge', (e) => e.in.surge], ['buyShare', (e) => e.in.buyShare], ['volPace', (e) => e.in.volPace], ['depth', (e) => e.in.depth]];
  const full = listed.filter((e) => e.labels[PRIMARY].ret != null && inputs.every(([, f]) => f(e) != null) && Object.keys(e.parts).length);
  const rk = inputs.map(([, f]) => ranks(full.map(f)));
  full.forEach((e, i) => { e.rankAvg = mean(rk.map((r) => r[i])); });
  const partNames = Object.keys(full[0]?.parts ?? {});
  for (const e of full) {
    e.sumAll = partNames.reduce((a, p) => a + (e.parts[p] ?? 0), 0);
    e.equal = e.sumAll / partNames.length;
  }
  // Best single raw input by tune-period |rho|, then judged on the same events as everything else.
  const tune = full.filter((e) => e.ts <= split);
  const best = inputs.map(([n, f]) => [n, f, spearman(tune.map(f), tune.map(retOf(PRIMARY)))]).filter((x) => x[2] != null).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]))[0];
  const rows = [['score (as stored)', (e) => e.score], ['opportunity (recomputed)', (e) => e.opportunity], ['equal-weight parts', (e) => e.equal],
    ['rank-average of surge/buyShare/volPace/depth', (e) => e.rankAvg], best ? [`best single input by tune rho: ${best[0]}`, best[1]] : null].filter(Boolean);
  const out = ['### 4. Composite vs simpler', '', `Same ${full.length} listed events (${mints(full)} mints) for every row. Direction is taken as the score assumes (higher is better); the best single input is chosen on the tune period only.`, '',
    '| composite | n mints | rho [95% CI] | rho tune | rho test | top-quintile win% | top-quintile mean ret | tag |', '|---|---|---|---|---|---|---|---|'];
  for (const [name, f] of rows) {
    const q = quintiles(full, f);
    const t = full.filter((x) => x.ts <= split), s = full.filter((x) => x.ts > split);
    out.push(`| ${name} | ${mints(full)} | ${num(corrStat(f, PRIMARY)(full))} ${interval(bootstrap(full, corrStat(f, PRIMARY), draws))} | ${num(corrStat(f, PRIMARY)(t))} (${mints(t)}) | ${num(corrStat(f, PRIMARY)(s))} (${mints(s)}${mints(s) < 20 ? ' thin' : ''}) | ${pct(mean(q[4].map(isWin(PRIMARY))))} | ${pct(mean(q[4].map(retOf(PRIMARY))))} | ${thin(full).trim()} |`);
  }
  const base = corrStat((e) => e.sumAll, PRIMARY)(full);
  out.push('', '#### Leave one part out', '', `Baseline: sum of all parts' share of max, rho ${num(base)}. Parts come from \`candidates.reasons\` as stored (weights at scan time).`, '',
    '| part left out | n mints | rho without [95% CI] | change in rho |', '|---|---|---|---|');
  for (const p of partNames) {
    const f = (e) => e.sumAll - (e.parts[p] ?? 0);
    const rho = corrStat(f, PRIMARY)(full);
    out.push(`| ${p} | ${mints(full)} | ${num(rho)} ${interval(bootstrap(full, corrStat(f, PRIMARY), draws))} | ${rho == null || base == null ? 'n/a' : (rho - base >= 0 ? '+' : '') + num(rho - base)} |`);
  }
  return out.join('\n') + '\n';
}

function buildReport({ events, controls, poolStat, unpricedStat, dataEnd, dbSame, draws, nPools, nCovered, nWithCandles }) {
  const ctx = { draws, split: dataEnd - 24 * 3600 };
  const listed = events.filter((e) => e.listed), vetoed = events.filter((e) => !e.listed);
  const out = [];
  out.push('# Backtest report', '',
    `Generated from \`${config.dbPath}\`, scans up to ${new Date(dataEnd * 1000).toISOString()}. Bootstrap: ${draws} draws over mints, fixed seed. Tune period = events up to the last 24h, test period = the last 24h. Rows under 20 mints are marked \`thin\`. Rows built on RugCheck report fields are marked \`leaky\` (the report may postdate the scan).`, '',
    '## 1. Coverage', '',
    `coverage: ${nCovered} of ${nPools} pools have candles (${pct(nCovered / nPools, 1)}); ${nWithCandles} with at least one candle`, '',
    `- pools: ${poolStat.fetched} fetched this run, ${poolStat.cached} from cache, ${poolStat.failed} failed, ${poolStat.missing} not cached (offline)`,
    `- events: ${events.length} scan events (${listed.length} listed, ${vetoed.length} vetoed) from ${mints(events)} mints, plus ${controls.length} control events`,
    `- unpriced (no usable candle) / open (horizon not over yet), per label set: ${LABEL_SETS.map((s) => `${s.id} ${unpricedStat.unpriced[s.id]} / ${unpricedStat.open[s.id]}`).join(', ')}`,
    `- DB opened with \`readOnly: true\`, never written. Size/mtime changed during this run: ${dbSame ? 'no' : 'yes (the live scanner writes this file; not this script)'}`,
    '- Opportunity is recomputed from stored market numbers: the DB has no `chg_m5`, theme or wallet data for these scans, so those inputs count as 0. Risk also reads the latest report (leaky).', '',
    '## 2. Base rate (control pools, no features)', '',
    '| label set | n events | win% | mean ret | dead% |', '|---|---|---|---|---|');
  for (const s of LABEL_SETS) {
    const c = priced(controls, s.id);
    out.push(`| ${s.id} (+${s.up * 100}% / -${s.dn * 100}%, ${s.h}h) | ${c.length} | ${pct(mean(c.map(isWin(s.id))), 1)} | ${pct(mean(c.map(retOf(s.id))), 1)} | ${pct(mean(c.map((r) => (r.labels[s.id].kind === 'dead' ? 1 : 0))), 1)} |`);
  }
  const raw = (k) => (e) => e.in[k];
  const rawMetrics = [['surge', 'surge'], ['buyShare', 'buy share'], ['volPace', 'volume pace'], ['chg_h1', '1h change'], ['depth', 'depth (liq/mcap)'], ['liquidity', 'liquidity $'], ['mcap', 'mcap $'], ['ageH', 'age (h)'], ['buyers', 'buyers 1h']]
    .map(([k, name]) => ({ name, f: raw(k) }));
  rawMetrics.push({ name: 'opportunity', f: (e) => e.opportunity }, { name: 'risk', f: (e) => e.risk, leaky: true },
    { name: 'top10 %', f: (e) => e.leaky.top10, leaky: true }, { name: 'insider %', f: (e) => e.leaky.insider, leaky: true }, { name: 'LP locked %', f: (e) => e.leaky.lpLocked, leaky: true });
  out.push('', '## 3. Inputs and parts (listed events)', '',
    metricTable('3a. Raw inputs', rawMetrics, listed, ctx));
  const partNames = [...new Set(listed.flatMap((e) => Object.keys(e.parts)))];
  const partMetrics = partNames.map((p) => ({ name: `part ${p}`, f: (e) => e.parts[p] }));
  out.push(metricTable('3b. Score parts (points / max)', partMetrics, listed, ctx));
  const pair = { health: 'surge', momentum: 'volPace', liquidity: 'depth' };
  out.push('### 3c. Clamped part vs its raw input', '', 'A part clamps its raw input to 0..1. If the raw input ranks outcomes clearly better than the part, the clamp throws signal away (flag).', '',
    '| part | raw input | n mints | rho part | rho raw | flag |', '|---|---|---|---|---|---|');
  for (const [p, k] of Object.entries(pair)) {
    const r = rowsWith(listed, (e) => (e.parts[p] != null && e.in[k] != null ? 1 : null), PRIMARY);
    const a = corrStat((e) => e.parts[p], PRIMARY)(r), b = corrStat((e) => e.in[k], PRIMARY)(r);
    out.push(`| ${p} | ${k} | ${mints(r)}${thin(r)} | ${num(a)} | ${num(b)} | ${a != null && b != null && Math.abs(b) - Math.abs(a) > 0.05 ? 'clamp loses signal' : ''} |`);
  }
  out.push('', composites(listed, ctx));
  const vetoNames = [...new Set(vetoed.flatMap((e) => e.vetoes))].sort();
  out.push('## 5. Vetoes', '', 'A coin with several vetoes appears in each row. The control row is the base rate of random new pools.', '',
    groupTable('Vetoed events vs passed', [['passed (listed)', listed], ...vetoNames.map((v) => [`veto ${v}`, vetoed.filter((e) => e.vetoes.includes(v))])], ctx, controls));
  const bands = [...config.bands.map(([b]) => b)];
  out.push('## 6. Bands (listed events)', '',
    groupTable('Score bands', bands.map((b) => [`band ${b}`, listed.filter((e) => e.band === b)]), ctx, controls));
  return out.join('\n');
}

// ---------- main ----------

export async function main(argv = process.argv.slice(2)) {
  const offline = argv.includes('--offline');
  const draws = Number(argv.find((a) => a.startsWith('--draws='))?.slice(8) ?? 1000);
  const log = (m) => process.stderr.write(`${m}\n`);
  const before = statSync(config.dbPath);
  const db = new DatabaseSync(config.dbPath, { readOnly: true });
  const untilArg = argv.find((a) => a.startsWith('--until='))?.slice(8);
  const until = untilArg ? Date.parse(untilArg) / 1000 : Infinity;
  if (Number.isNaN(until)) throw new Error(`bad --until ${untilArg}`);
  const events = loadEvents(db, until);
  const controls = pickControls(db, events, until);
  const dataEnd = db.prepare('SELECT MAX(ts) t FROM pool_snapshots WHERE ts <= ?').get(until).t;
  db.close();
  const pools = fetchOrder(events, controls);
  log(`${events.length} events, ${controls.length} controls, ${pools.length} pools${offline ? ' (offline)' : ''}`);
  const poolStat = await fetchPools(pools, { offline, log });
  const unpricedStat = priceEvents([...events, ...controls], dataEnd);
  const covered = pools.map(readCache).filter(Boolean);
  const after = statSync(config.dbPath);
  const dbSame = before.size === after.size && before.mtimeMs === after.mtimeMs;
  process.stdout.write(buildReport({ events, controls, poolStat, unpricedStat, dataEnd, dbSame, draws, nPools: pools.length, nCovered: covered.length, nWithCandles: covered.filter((c) => c.list.length).length }) + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
