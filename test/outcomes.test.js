import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { scheduleOutcomes, fillOutcomes, calibration } from '../src/outcomes.js';

test('outcome log stores score and later prices; calibration groups by band', async () => {
  const db = openDb(':memory:');
  const MINT = 'M'.repeat(4) + '1'.repeat(36);
  const t0 = 1_000_000;
  const id = Number(db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd) VALUES (?,?,82,'strong',1,1.0)").run(t0, MINT).lastInsertRowid);
  assert.equal(scheduleOutcomes(db, id, MINT, t0), true);
  assert.equal(scheduleOutcomes(db, id + 1, MINT, t0 + 10), false); // second listing inside 30 min adds none
  assert.deepEqual(db.prepare('SELECT horizon_h FROM outcomes ORDER BY horizon_h').all().map((r) => r.horizon_h), [0.25, 1, 6, 24]);
  let price = 1.5;
  const dexGet = async () => [{ chainId: 'solana', dexId: 'x', baseToken: { address: MINT }, priceUsd: String(price), liquidity: { usd: 1 } }];
  for (const h of [0.25, 1, 6, 24]) {
    await fillOutcomes({ db, dexGet, now: () => (t0 + h * 3600 + 5) * 1000 });
    price += 0.5;
  }
  const rows = db.prepare('SELECT * FROM outcomes ORDER BY horizon_h').all();
  assert.deepEqual(rows.map((r) => r.status), ['done', 'done', 'done', 'done']);
  assert.deepEqual(rows.map((r) => r.price_usd), [1.5, 2, 2.5, 3]);
  const cal = calibration(db).rows;
  assert.equal(cal.length, 4);
  assert.ok(cal.every((r) => r.band === 'strong' && r.count === 1 && r.positiveShare === 1));
  assert.ok(Math.abs(cal[0].meanChangePct - 50) < 1e-9);
});

test('unpriced rows become missed an hour after due', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd) VALUES (100,'m',50,'neutral',1,1)").run();
  scheduleOutcomes(db, 1, 'm', 100);
  await fillOutcomes({ db, dexGet: async () => [], now: () => (100 + 3600 + 3601) * 1000 });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM outcomes WHERE status = 'missed'").get().c, 2); // 0.25 h and 1 h rows
  assert.equal(calibration(db).missed, 2);
});

test('outcomes are scheduled only for candidates 30+ minutes apart', () => {
  const db = openDb(':memory:');
  const ins = db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd) VALUES (?, 'm', 50, 'neutral', 1, 1)");
  const sched = [0, 600, 2100].map((t) => scheduleOutcomes(db, Number(ins.run(t).lastInsertRowid), 'm', t));
  assert.deepEqual(sched, [true, false, true]);
  assert.deepEqual(db.prepare('SELECT DISTINCT candidate_id FROM outcomes ORDER BY 1').all().map((r) => r.candidate_id), [1, 3]);
});

const fakeDex = (mint, price) => async () => [{ chainId: 'solana', dexId: 'x', baseToken: { address: mint }, priceUsd: String(price), liquidity: { usd: 1 } }];

test('fillOutcomes stores path extremes; no path gives the endpoint', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd) VALUES (100,'m',50,'neutral',1,1)").run();
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd) VALUES (100,'n',50,'neutral',1,1)").run();
  scheduleOutcomes(db, 1, 'm', 100);
  scheduleOutcomes(db, 2, 'n', 100);
  const snap = db.prepare("INSERT INTO pool_snapshots(mint, ts, price_usd) VALUES ('m', ?, ?)");
  snap.run(500, 1.3); snap.run(900, 0.6);
  const dexGet = async () => [
    { chainId: 'solana', dexId: 'x', baseToken: { address: 'm' }, priceUsd: '0.9', liquidity: { usd: 1 } },
    { chainId: 'solana', dexId: 'x', baseToken: { address: 'n' }, priceUsd: '0.8', liquidity: { usd: 1 } },
  ];
  await fillOutcomes({ db, dexGet, now: () => (100 + 3600 + 5) * 1000 });
  const get = (id) => db.prepare('SELECT * FROM outcomes WHERE candidate_id = ? AND horizon_h = 1').get(id);
  const a = get(1);
  assert.ok(Math.abs(a.max_gain - 0.3) < 1e-9 && Math.abs(a.max_loss + 0.4) < 1e-9);
  assert.equal(a.path_points, 3);
  assert.equal(a.price_usd, 0.9);
  const b = get(2);
  assert.ok(Math.abs(b.max_gain + 0.2) < 1e-9 && Math.abs(b.max_loss + 0.2) < 1e-9);
  assert.equal(b.path_points, 1);
});

test('calibration reports hit rates, parts thirds and thin paths', () => {
  const db = openDb(':memory:');
  const reasons = (v) => JSON.stringify([{ part: 'health', points: v * 10, max: 10 }]);
  const cand = db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd, reasons, risk) VALUES (?, ?, 50, 'neutral', 1, 1, ?, ?)");
  const out = db.prepare("INSERT INTO outcomes(candidate_id, horizon_h, due_ts, price_usd, max_gain, max_loss, path_points, status) VALUES (?, 1, 0, 1, ?, ?, ?, 'done')");
  const add = (mint, v, risk, gain, loss, pts) => out.run(Number(cand.run(1, mint, reasons(v), risk).lastInsertRowid), gain, loss, pts);
  add('a', 0.9, 80, 0.25, -0.35, 5); // high health, high risk, both hits
  add('b', 0.1, 10, 0.05, -0.05, 1); // low health, low risk, thin path
  add('c', 0.5, 40, null, null, null); // old row, no path
  const cal = calibration(db);
  const r = cal.rows.find((x) => x.band === 'neutral' && x.horizon_h === 1);
  assert.equal(r.count, 3);
  assert.equal(r.pathCount, 2);
  assert.equal(r.hitUp20, 0.5);
  assert.equal(r.hitDown30, 0.5);
  assert.equal(cal.thinPath, 1);
  const p = (part, third) => cal.parts.find((x) => x.part === part && x.third === third);
  assert.equal(p('health', 2).hitDown30, 1);
  assert.equal(p('health', 0).hitDown30, 0);
  assert.equal(p('risk', 2).count, 1);
  assert.equal(p('health', 1), undefined); // pathless row excluded
});
