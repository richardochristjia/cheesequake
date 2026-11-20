import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pool_snapshots(ts, source, pool, mint, symbol, name, dex, created_at, price_usd, fdv_usd, mcap_usd, liquidity_usd, vol_h1, vol_h6, vol_h24, buys_h1, sells_h1, buyers_h1, buyers_h6, chg_h1);
CREATE INDEX IF NOT EXISTS snap_mint_ts ON pool_snapshots(mint, ts);
CREATE TABLE IF NOT EXISTS tokens(mint PRIMARY KEY, symbol, name, description, creator, first_seen, image_url);
CREATE TABLE IF NOT EXISTS market_samples(ts, launch_rate, active_share);
CREATE TABLE IF NOT EXISTS market_hourly(hour PRIMARY KEY, launch_rate, active_share, trending_vol, buy_sell_ratio, median_chg, index_value, zone);
CREATE TABLE IF NOT EXISTS wallet_cursor(address PRIMARY KEY, last_sig);
CREATE TABLE IF NOT EXISTS trades(sig, wallet, mint, side, token_amount, quote_usd, ts, PRIMARY KEY(sig, wallet, mint));
CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, ts, kind, mint, wallet, detail, dedupe UNIQUE);
CREATE TABLE IF NOT EXISTS reports(mint PRIMARY KEY, ts, json);
CREATE TABLE IF NOT EXISTS candidates(id INTEGER PRIMARY KEY, ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd);
CREATE TABLE IF NOT EXISTS outcomes(candidate_id, horizon_h, due_ts, price_usd, status, PRIMARY KEY(candidate_id, horizon_h));
CREATE TABLE IF NOT EXISTS theme_hourly(hour, keyword, tokens, volume, share, PRIMARY KEY(hour, keyword));
CREATE TABLE IF NOT EXISTS token_theme(mint PRIMARY KEY, keyword, hour);
CREATE TABLE IF NOT EXISTS trace_cache(start PRIMARY KEY, ts, status, json);
CREATE TABLE IF NOT EXISTS pending_sigs(sig PRIMARY KEY, wallet, cycles);
CREATE TABLE IF NOT EXISTS watched_coins(mint PRIMARY KEY, added_ts);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const added = [['tokens', 'image_url'], ['pool_snapshots', 'chg_m5'],
    ['outcomes', 'max_gain'], ['outcomes', 'max_loss'], ['outcomes', 'path_points'],
    ['candidates', 'opportunity'], ['candidates', 'risk'], ['candidates', 'risk_reasons'],
    ['candidates', 'top10_pct'], ['candidates', 'insider_pct'], ['candidates', 'lp_locked_pct']];
  for (const [table, col] of added) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
    }
  }
  return db;
}
