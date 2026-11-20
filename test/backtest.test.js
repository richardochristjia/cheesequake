import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.js';
import { label, priceEvents, dedupeHourly, spearman, quintiles, bootstrap, loadEvents, openReadOnly } from '../scripts/backtest.js';

const T0 = 1_000_200; // 10-minute-aligned scan time; candles are 5-minute buckets
const c = (min, o, h, l, cl) => [T0 + min * 60, o, h, l, cl, 1];
const opts = { scanTs: T0, liquidity: 1e9, up: 0.3, dn: 0.2, h: 1 }; // liquidity so large that impact is ~0
const FEES = 0.01;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);

test('upper barrier first is a win', () => {
  const l = label([c(0, 1, 1.05, 0.95, 1), c(10, 1, 1.3, 1, 1.2), c(40, 1.2, 1.2, 0.8, 0.8)], opts);
  assert.equal(l.kind, 'win');
  near(l.ret, 0.3 - FEES);
});

test('lower barrier first is a loss', () => {
  const l = label([c(0, 1, 1, 0.79, 0.8), c(10, 0.8, 1.4, 0.8, 1.4)], opts);
  assert.equal(l.kind, 'loss');
  near(l.ret, -0.2 - FEES);
});

test('both barriers inside one candle count as the loss', () => {
  const l = label([c(0, 1, 1.5, 0.7, 1)], opts);
  assert.equal(l.kind, 'loss');
});

test('no barrier: last close in the horizon over entry, minus costs', () => {
  const l = label([c(0, 1, 1.05, 0.95, 1.02), c(30, 1.02, 1.05, 0.96, 1.04), c(65, 1.04, 5, 1, 5)], opts); // last candle is past the 1h horizon
  assert.equal(l.kind, 'drift');
  near(l.ret, 0.04 - FEES);
});

test('dead coin: down 60% then no candle for 2h is -100%', () => {
  const l = label([c(0, 1, 1, 0.9, 0.9), c(10, 0.9, 0.9, 0.4, 0.4), c(300, 0.4, 0.4, 0.4, 0.4)], opts);
  assert.equal(l.kind, 'dead');
  assert.equal(l.ret, -1);
  // same drop followed by trading is an ordinary loss
  assert.equal(label([c(0, 1, 1, 0.9, 0.9), c(10, 0.9, 0.9, 0.4, 0.4), c(20, 0.4, 0.4, 0.4, 0.4), c(30, 0.4, 0.4, 0.4, 0.4)], { ...opts, dataEnd: T0 + 90 * 60 }).kind, 'loss');
});

test('entry is the open of the first candle at or after the scan', () => {
  const scan = T0 + 3 * 60; // 3 minutes into the first bucket: entry is the next one
  const l = label([c(0, 9, 9, 9, 9), c(5, 1, 1.31, 1, 1.2)], { ...opts, scanTs: scan });
  assert.equal(l.kind, 'win'); // 1.31 / 1 (the 5-minute candle's open), not 9
  assert.equal(label([c(0, 1, 1, 1, 1)], { ...opts, scanTs: scan }).kind, 'unpriced');
});

test('control event (no entry price): first candle more than 10 minutes after the scan is unpriced', () => {
  assert.equal(label([c(50, 1, 1.3, 1, 1.3)], opts).kind, 'unpriced');
  assert.equal(label([c(15, 1, 1.3, 1, 1.3)], opts).kind, 'unpriced');
  assert.equal(label([c(10, 1, 1.3, 1, 1.3)], opts).kind, 'win');
});

test('entry price given: enters at it and ignores the candle that holds the scan', () => {
  const scan = T0 + 3 * 60;
  const l = label([c(0, 1, 2, 1, 1), c(5, 1, 1.05, 0.95, 1)], { ...opts, scanTs: scan, entry: 1 });
  assert.notEqual(l.kind, 'win'); // the 10:00 candle's 2.0 high predates the scan
  assert.equal(label([c(5, 1.5, 1.6, 1.4, 1.5)], { ...opts, scanTs: scan, entry: 1 }).kind, 'win'); // priced against 1, not the 1.5 open
});

test('entry price given: no delay cap, but no candle in the window is unpriced', () => {
  assert.equal(label([c(50, 1, 1.3, 1, 1.3)], { ...opts, entry: 1 }).kind, 'win');
  assert.equal(label([c(-10, 1, 1.3, 1, 1.3)], { ...opts, entry: 1 }).kind, 'unpriced');
});

test('gross is the outcome without costs: win 0.30 gross, 0.25 net in a $10k pool', () => {
  const l = label([c(0, 1, 1.3, 1, 1.3)], { ...opts, liquidity: 10_000 });
  near(l.gross, 0.3);
  near(l.ret, 0.25);
  near(label([c(0, 1, 1, 0.79, 0.8)], opts).gross, -0.2);
  near(label([c(0, 1, 1.05, 0.95, 1.02), c(30, 1.02, 1.05, 0.96, 1.04)], opts).gross, 0.04);
  assert.equal(label([c(0, 1, 1, 0.9, 0.9), c(10, 0.9, 0.9, 0.4, 0.4), c(300, 0.4, 0.4, 0.4, 0.4)], opts).gross, -1);
});

test('impact: $200 in a $10k pool costs 4% plus 1% fees', () => {
  const l = label([c(0, 1, 1.3, 1, 1.3)], { ...opts, liquidity: 10_000 });
  near(l.ret, 0.3 - 0.05);
});

test('horizon still running is open, not priced', () => {
  assert.equal(label([c(0, 1, 1.3, 1, 1.3)], { ...opts, dataEnd: T0 + 600 }).kind, 'open');
});

test('horizon past the candle fetch is open even when the DB runs later', () => {
  const list = [c(0, 1, 1.05, 0.95, 1), c(20, 1, 1.05, 0.95, 1.02)];
  const e = { pool: 'P', ts: T0, liquidity: 1e9 };
  priceEvents([e], T0 + 7 * 3600, () => ({ pool: 'P', fetchedAt: T0 + 30 * 60, list }));
  assert.equal(e.labels.a1h.kind, 'open'); // was drift when only the DB end was checked
});

test('twelve scans of a mint in one hour make one event', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ mint: 'A', ts: 3600 * 5 + i * 300 }));
  rows.push({ mint: 'B', ts: 3600 * 5 + 10 }, { mint: 'A', ts: 3600 * 6 });
  assert.deepEqual(dedupeHourly(rows).map((r) => `${r.mint}${r.ts}`), ['A18000', 'B18010', 'A21600']);
});

test('spearman is 1 for ranked pairs, -1 reversed', () => {
  assert.equal(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), 1);
  assert.equal(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]), -1);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null);
});

test('quintiles split ordered values into five groups', () => {
  const q = quintiles(Array.from({ length: 10 }, (_, i) => ({ x: 10 - i })), (r) => r.x);
  assert.deepEqual(q.map((g) => g.map((r) => r.x)), [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
});

test('bootstrap interval brackets the estimate and is repeatable', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ mint: `m${i % 30}`, v: i % 3 }));
  const mean = (r) => r.reduce((a, x) => a + x.v, 0) / r.length;
  const ci = bootstrap(rows, mean, 200);
  assert.ok(ci[0] < mean(rows) && mean(rows) < ci[1]);
  assert.deepEqual(bootstrap(rows, mean, 200), ci);
});

function scanDb(candidateCols = '') {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, pool, price_usd, liquidity_usd) VALUES (?, 'candidate', 'M', 'P', 1, 1e6)").run(T0);
  db.prepare('INSERT INTO reports(mint, ts, json) VALUES (?, ?, ?)').run('M', T0 + 3600, JSON.stringify({ topHolders: [{ address: 'a', owner: 'o', pct: 40 }], knownAccounts: [], insiderHolding: 5, supply: 100, lpLockedPct: 10 }));
  db.prepare(`INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns ${candidateCols ? ', top10_pct, insider_pct, lp_locked_pct' : ''}) VALUES (?, 'M', 50, 'mixed', 1, '[]', '[]', '[]' ${candidateCols})`).run(T0);
  return db;
}

test('scan-time facts beat the latest report and are not leaky; the fallback is leaky', () => {
  const [e] = loadEvents(scanDb(", 12, 3, 95"), Infinity);
  assert.deepEqual(e.facts, { top10: 12, insider: 3, lpLocked: 95 });
  assert.deepEqual(e.leaky, { top10: false, insider: false, lpLocked: false });
  const [f] = loadEvents(scanDb(), Infinity);
  assert.deepEqual(f.facts, { top10: 40, insider: 5, lpLocked: 10 });
  assert.deepEqual(f.leaky, { top10: true, insider: true, lpLocked: true });
  assert.equal(f.entry, 1);
});

test('loadEvents tolerates a DB whose candidates table lacks the fact columns', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE candidates(id INTEGER PRIMARY KEY, ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd);
    CREATE TABLE pool_snapshots(ts, source, mint, pool, price_usd, liquidity_usd, mcap_usd, created_at, buyers_h1, buyers_h6, buys_h1, sells_h1, vol_h1, vol_h6, chg_h1, chg_m5);
    CREATE TABLE reports(mint PRIMARY KEY, ts, json);
    INSERT INTO pool_snapshots(ts, source, mint, pool, price_usd) VALUES (${T0}, 'candidate', 'M', 'P', 1);
    INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns) VALUES (${T0}, 'M', 50, 'mixed', 1, '[]', '[]', '[]');`);
  assert.deepEqual(loadEvents(db, Infinity)[0].facts, { top10: null, insider: null, lpLocked: null });
});

test('read-only handle waits out a write lock held for about a second', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bt-lock-'));
  const path = join(dir, 'lock.db');
  try {
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE t(x); INSERT INTO t VALUES (1)');
    db.close();
    const holder = spawn(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(${JSON.stringify(path)});d.exec('BEGIN EXCLUSIVE');console.log('locked');setTimeout(()=>{d.exec('COMMIT');},1000)`]);
    await new Promise((res, rej) => { holder.stdout.once('data', res); holder.once('error', rej); });
    const ro = openReadOnly(path);
    assert.equal(ro.prepare('SELECT x FROM t').get().x, 1);
    ro.close();
    await new Promise((res) => holder.once('exit', res));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
