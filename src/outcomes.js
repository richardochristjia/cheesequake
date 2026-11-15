import { config as defaultConfig } from './config.js';
import { tokenBatch } from './sources/dexscreener.js';

// First listing of a mint in 24 h gets one row per horizon.
export function scheduleOutcomes(db, candidateId, mint, ts, config = defaultConfig) {
  const prior = db.prepare('SELECT 1 FROM candidates WHERE mint = ? AND listed = 1 AND id < ? AND ts > ?').get(mint, candidateId, ts - 86400);
  if (prior) return false;
  const ins = db.prepare("INSERT OR IGNORE INTO outcomes(candidate_id, horizon_h, due_ts, status) VALUES (?,?,?,'due')");
  for (const h of config.outcome.horizonsHours) ins.run(candidateId, h, ts + h * 3600);
  return true;
}

// Prices due rows; a row still unpriced an hour after it was due becomes "missed".
export async function fillOutcomes({ db, dexGet, now }) {
  const nowS = Math.floor(now() / 1000);
  const due = db.prepare(
    "SELECT o.candidate_id, o.horizon_h, o.due_ts, c.mint FROM outcomes o JOIN candidates c ON c.id = o.candidate_id WHERE o.status = 'due' AND o.due_ts <= ?").all(nowS);
  if (!due.length) return 0;
  let prices = new Map();
  try { prices = await tokenBatch(dexGet, [...new Set(due.map((d) => d.mint))]); } catch (e) {
    if (e.code !== 'SOURCE_UNAVAILABLE') throw e;
  }
  const done = db.prepare("UPDATE outcomes SET price_usd = ?, status = 'done' WHERE candidate_id = ? AND horizon_h = ?");
  const miss = db.prepare("UPDATE outcomes SET status = 'missed' WHERE candidate_id = ? AND horizon_h = ?");
  let filled = 0;
  for (const d of due) {
    const p = prices.get(d.mint)?.price_usd;
    if (p != null) { done.run(p, d.candidate_id, d.horizon_h); filled++; } else if (nowS > d.due_ts + 3600) miss.run(d.candidate_id, d.horizon_h);
  }
  return filled;
}

// Per band and horizon: count, mean % change from the candidate's price, share positive. Missed rows counted apart.
export function calibration(db, config = defaultConfig) {
  const rows = db.prepare(
    `SELECT c.band, o.horizon_h, o.price_usd, c.price_usd AS base FROM outcomes o JOIN candidates c ON c.id = o.candidate_id
     WHERE o.status = 'done' AND c.price_usd > 0`).all();
  const out = [];
  for (const [band] of config.bands) for (const h of config.outcome.horizonsHours) {
    const ch = rows.filter((r) => r.band === band && r.horizon_h === h).map((r) => (r.price_usd / r.base - 1) * 100);
    if (ch.length) out.push({ band, horizon_h: h, count: ch.length, meanChangePct: ch.reduce((a, b) => a + b, 0) / ch.length, positiveShare: ch.filter((x) => x > 0).length / ch.length });
  }
  const missed = db.prepare("SELECT COUNT(*) c FROM outcomes WHERE status = 'missed'").get().c;
  return { rows: out, missed };
}
