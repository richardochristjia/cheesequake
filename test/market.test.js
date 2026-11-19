import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../src/db.js';
import { newPools } from '../src/sources/geckoterminal.js';
import { tokenBatch } from '../src/sources/dexscreener.js';
import { sampleNewPools, snapTrending, rollHourly, trenchIndex } from '../src/market.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const getFx = (name) => async () => fx(name);

test('parse new pools keeps nulls as null', async () => {
  const [a, b] = await newPools(getFx('new_pools'));
  assert.equal(a.mint, 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  assert.equal(a.mcap_usd, null);
  assert.equal(a.liquidity_usd, null);
  assert.equal(a.buyers_h1, 1);
  assert.equal(a.vol_h1, 6.8);
  assert.equal(b.liquidity_usd, 8000);
  assert.ok(a.created_at > b.created_at);
});

test('token batch keeps solana pair with most liquidity', async () => {
  const m = await tokenBatch(getFx('token_batch'), ['MintCcccccccccccccccccccccccccccccccccccc3']);
  assert.equal(m.size, 1);
  assert.equal(m.get('MintCcccccccccccccccccccccccccccccccccccc3').liquidity_usd, 90000);
});

const rows = (n) => Array.from({ length: n }, (_, i) => ({
  hour: i, launch_rate: i % 7, active_share: (i % 5) / 5, trending_vol: i, buy_sell_ratio: 1 + (i % 3), median_chg: (i % 11) - 5,
}));

test('index is an integer 0-100 with a zone', () => {
  const r = rows(720);
  r[719] = { ...r[719], launch_rate: 99, active_share: 1, trending_vol: 1e9, buy_sell_ratio: 9, median_chg: 50 };
  const x = trenchIndex(r);
  assert.ok(Number.isInteger(x.value) && x.value >= 0 && x.value <= 100);
  assert.equal(x.value, 100);
  assert.equal(x.zone, 'Euphoria');
});

test('index warms up under 168 rows', () => {
  assert.deepEqual(trenchIndex(rows(48)), { value: null, zone: 'warming up' });
});

test('store collects snapshots, samples and an hourly row', async () => {
  const db = openDb(':memory:');
  let t = 3600 * 1000 * 10; // hour 10
  await sampleNewPools({ db, get: getFx('new_pools'), now: () => t });
  await snapTrending({ db, get: getFx('trending_pools'), now: () => t });
  t += 3600 * 1000;
  assert.equal(rollHourly({ db, now: () => t }), 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM pool_snapshots').get().c, 3);
  const h = db.prepare('SELECT * FROM market_hourly').get();
  assert.equal(h.trending_vol, 60000);
  assert.equal(h.zone, 'warming up');
});

test('openDb adds v2 columns to an old database and keeps rows', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const path = join(mkdtempSync(join(tmpdir(), 'cq-')), 'old.db');
  let db = openDb(path);
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed) VALUES (1,'m',50,'x',1)").run();
  for (const [t, c] of [['outcomes', 'max_gain'], ['outcomes', 'max_loss'], ['outcomes', 'path_points'], ['pool_snapshots', 'chg_m5'], ['candidates', 'opportunity'], ['candidates', 'risk'], ['candidates', 'risk_reasons']]) db.exec(`ALTER TABLE ${t} DROP COLUMN ${c}`);
  db.close();
  db = openDb(path);
  const has = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.ok(['max_gain', 'max_loss', 'path_points'].every(c => has('outcomes').includes(c)));
  assert.ok(has('pool_snapshots').includes('chg_m5'));
  assert.ok(['opportunity', 'risk', 'risk_reasons'].every(c => has('candidates').includes(c)));
  assert.equal(db.prepare('SELECT risk FROM candidates').get().risk, null);
  db.close();
});
