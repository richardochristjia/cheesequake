import test from 'node:test';
import assert from 'node:assert/strict';
import { label, priceEvents, dedupeHourly, spearman, quintiles, bootstrap } from '../scripts/backtest.js';

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

test('first candle more than 10 minutes after the scan is unpriced', () => {
  assert.equal(label([c(50, 1, 1.3, 1, 1.3)], opts).kind, 'unpriced');
  assert.equal(label([c(10, 1, 1.3, 1, 1.3)], opts).kind, 'win');
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
