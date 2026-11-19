import { newPools, trendingPools } from './sources/geckoterminal.js';
import { config } from './config.js';

const COLS = ['pool', 'mint', 'symbol', 'name', 'dex', 'created_at', 'price_usd', 'fdv_usd', 'mcap_usd', 'liquidity_usd',
  'vol_h1', 'vol_h6', 'vol_h24', 'buys_h1', 'sells_h1', 'buyers_h1', 'buyers_h6', 'chg_h1', 'chg_m5'];

export function storeSnapshots(db, rows, source, ts) {
  const ins = db.prepare(`INSERT INTO pool_snapshots(ts, source, ${COLS.join(',')}) VALUES (?,?,${COLS.map(() => '?').join(',')})`);
  for (const r of rows) ins.run(ts, source, ...COLS.map((c) => r[c] ?? null));
}

// Latest SOL price seen on a SOL-quoted pool; other modules use it to value trades.
export const last = { solUsd: null };
const noteSol = (pools) => { const p = pools.find((x) => x.sol_usd); if (p) last.solUsd = p.sol_usd; };

export const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export function upsertTokens(db, rows, ts) {
  const ins = db.prepare('INSERT INTO tokens(mint, symbol, name, first_seen, image_url) VALUES (?,?,?,?,?) ON CONFLICT(mint) DO UPDATE SET image_url = COALESCE(excluded.image_url, tokens.image_url)');
  for (const r of rows) if (r.mint) ins.run(r.mint, r.symbol, r.name, ts, r.image_url ?? null);
}

// Every 60 s: new pools page, snapshots, one market sample.
export async function sampleNewPools({ db, get, now }) {
  const ts = Math.floor(now() / 1000);
  const pools = await newPools(get);
  noteSol(pools);
  storeSnapshots(db, pools, 'new', ts);
  const times = pools.map((p) => p.created_at).filter((x) => x !== null);
  const span = times.length ? Math.max(...times) - Math.min(...times) : 0;
  if (!pools.length || span <= 0) return null; // a zero span cannot give a rate
  const sample = {
    launch_rate: pools.length / (span / 60),
    active_share: pools.filter((p) => (p.buyers_h1 ?? 0) >= 10).length / pools.length,
  };
  db.prepare('INSERT INTO market_samples(ts, launch_rate, active_share) VALUES (?,?,?)').run(ts, sample.launch_rate, sample.active_share);
  return sample;
}

// Every 300 s: trending snapshots.
export async function snapTrending({ db, get, now }) {
  const ts = Math.floor(now() / 1000);
  const pools = await trendingPools(get);
  noteSol(pools);
  storeSnapshots(db, pools, 'trending', ts);
  upsertTokens(db, pools, ts);
  return pools;
}

const zoneOf = (v) => (v < 20 ? 'Cold' : v < 40 ? 'Cool' : v < 60 ? 'Neutral' : v < 80 ? 'Hot' : 'Euphoria');
const COMPONENTS = ['launch_rate', 'active_share', 'trending_vol', 'buy_sell_ratio', 'median_chg'];

// rows: last 720 hourly rows, newest last.
export function trenchIndex(rows) {
  if (rows.length < config.index.warmupHours) return { value: null, zone: 'warming up' };
  const newest = rows[rows.length - 1];
  const pcts = [];
  for (const c of COMPONENTS) {
    if (newest[c] === null || newest[c] === undefined) continue;
    const vals = rows.map((r) => r[c]).filter((x) => x !== null && x !== undefined);
    pcts.push(vals.filter((v) => v <= newest[c]).length / vals.length);
  }
  if (!pcts.length) return { value: null, zone: 'warming up' };
  const value = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100);
  return { value, zone: zoneOf(value) };
}

export function recentHourly(db, limit = config.index.windowHours) {
  return db.prepare('SELECT * FROM (SELECT * FROM market_hourly ORDER BY hour DESC LIMIT ?) ORDER BY hour').all(limit);
}

// Writes a market_hourly row for every finished hour that has samples and no row yet.
export function rollHourly({ db, now }) {
  const cur = Math.floor(now() / 1000 / 3600) * 3600;
  const hours = db.prepare(
    `SELECT DISTINCT (ts/3600)*3600 AS h FROM market_samples WHERE (ts/3600)*3600 < ?
     AND (ts/3600)*3600 NOT IN (SELECT hour FROM market_hourly) ORDER BY h`).all(cur).map((r) => r.h);
  for (const h of hours) {
    const s = db.prepare('SELECT launch_rate, active_share FROM market_samples WHERE ts >= ? AND ts < ?').all(h, h + 3600);
    const tsT = db.prepare("SELECT MAX(ts) AS t FROM pool_snapshots WHERE source='trending' AND ts < ?").get(h + 3600).t;
    const tr = tsT === null ? [] : db.prepare("SELECT vol_h1, buys_h1, sells_h1, chg_h1 FROM pool_snapshots WHERE source='trending' AND ts = ?").all(tsT);
    const sum = (k) => tr.reduce((a, r) => a + (r[k] ?? 0), 0);
    const sells = sum('sells_h1');
    const row = {
      hour: h,
      launch_rate: median(s.map((x) => x.launch_rate)),
      active_share: median(s.map((x) => x.active_share)),
      trending_vol: tr.length ? sum('vol_h1') : null,
      buy_sell_ratio: tr.length ? (sells === 0 ? sum('buys_h1') : sum('buys_h1') / sells) : null,
      median_chg: median(tr.map((r) => r.chg_h1)),
    };
    const { value, zone } = trenchIndex([...recentHourly(db, config.index.windowHours - 1), row]);
    db.prepare('INSERT INTO market_hourly(hour, launch_rate, active_share, trending_vol, buy_sell_ratio, median_chg, index_value, zone) VALUES (?,?,?,?,?,?,?,?)')
      .run(h, row.launch_rate, row.active_share, row.trending_vol, row.buy_sell_ratio, row.median_chg, value, zone);
  }
  return hours.length;
}
