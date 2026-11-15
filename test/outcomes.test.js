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
  assert.equal(scheduleOutcomes(db, id + 1, MINT, t0 + 10), false); // second listing inside 24 h adds none
  let price = 1.5;
  const dexGet = async () => [{ chainId: 'solana', dexId: 'x', baseToken: { address: MINT }, priceUsd: String(price), liquidity: { usd: 1 } }];
  for (const h of [1, 6, 24]) {
    await fillOutcomes({ db, dexGet, now: () => (t0 + h * 3600 + 5) * 1000 });
    price += 0.5;
  }
  const rows = db.prepare('SELECT * FROM outcomes ORDER BY horizon_h').all();
  assert.deepEqual(rows.map((r) => r.status), ['done', 'done', 'done']);
  assert.deepEqual(rows.map((r) => r.price_usd), [1.5, 2, 2.5]);
  const cal = calibration(db).rows;
  assert.equal(cal.length, 3);
  assert.ok(cal.every((r) => r.band === 'strong' && r.count === 1 && r.positiveShare === 1));
  assert.ok(Math.abs(cal[0].meanChangePct - 50) < 1e-9);
});

test('unpriced rows become missed an hour after due', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, price_usd) VALUES (100,'m',50,'neutral',1,1)").run();
  scheduleOutcomes(db, 1, 'm', 100);
  await fillOutcomes({ db, dexGet: async () => [], now: () => (100 + 3600 + 3601) * 1000 });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM outcomes WHERE status = 'missed'").get().c, 1);
  assert.equal(calibration(db).missed, 1);
});
