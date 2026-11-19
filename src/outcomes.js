import { config as defaultConfig } from './config.js';
import { tokenBatch } from './sources/dexscreener.js';

// A listing gets one row per horizon unless the mint already had a candidate within everyMinutes.
export function scheduleOutcomes(db, candidateId, mint, ts, config = defaultConfig) {
  const prior = db.prepare('SELECT 1 FROM outcomes o JOIN candidates c ON c.id = o.candidate_id WHERE c.mint = ? AND c.id < ? AND c.ts > ?')
    .get(mint, candidateId, ts - config.outcome.everyMinutes * 60);
  if (prior) return false;
  const ins = db.prepare("INSERT OR IGNORE INTO outcomes(candidate_id, horizon_h, due_ts, status) VALUES (?,?,?,'due')");
  for (const h of config.outcome.horizonsHours) ins.run(candidateId, h, ts + h * 3600);
  return true;
}

// Prices due rows; a row still unpriced an hour after it was due becomes "missed".
export async function fillOutcomes({ db, dexGet, now }) {
  const nowS = Math.floor(now() / 1000);
  const due = db.prepare(
    "SELECT o.candidate_id, o.horizon_h, o.due_ts, c.mint, c.ts, c.price_usd AS base FROM outcomes o JOIN candidates c ON c.id = o.candidate_id WHERE o.status = 'due' AND o.due_ts <= ?").all(nowS);
  if (!due.length) return 0;
  let prices = new Map();
  try { prices = await tokenBatch(dexGet, [...new Set(due.map((d) => d.mint))]); } catch (e) {
    if (e.code !== 'SOURCE_UNAVAILABLE') throw e;
  }
  const done = db.prepare("UPDATE outcomes SET price_usd = ?, max_gain = ?, max_loss = ?, path_points = ?, status = 'done' WHERE candidate_id = ? AND horizon_h = ?");
  const miss = db.prepare("UPDATE outcomes SET status = 'missed' WHERE candidate_id = ? AND horizon_h = ?");
  const snaps = db.prepare('SELECT price_usd FROM pool_snapshots WHERE mint = ? AND ts > ? AND ts <= ? AND price_usd > 0');
  let filled = 0;
  for (const d of due) {
    const p = prices.get(d.mint)?.price_usd;
    if (p != null) {
      let gain = null, loss = null, n = null;
      if (d.base > 0) {
        const path = [...snaps.all(d.mint, d.ts, d.due_ts).map((r) => r.price_usd), p];
        gain = Math.max(...path) / d.base - 1; loss = Math.min(...path) / d.base - 1; n = path.length;
      }
      done.run(p, gain, loss, n, d.candidate_id, d.horizon_h); filled++;
    } else if (nowS > d.due_ts + 3600) miss.run(d.candidate_id, d.horizon_h);
  }
  return filled;
}

const share = (rows, f) => (rows.length ? rows.filter(f).length / rows.length : null);
const up20 = (r) => r.max_gain >= 0.2;
const down30 = (r) => r.max_loss <= -0.3;

// Per band and horizon: count, mean % change from the candidate's price, share positive, path hit rates (rows with a path only).
// parts: 1h rows with a path, split into thirds of each score part, opportunity and risk. Missed rows counted apart.
export function calibration(db, config = defaultConfig) {
  const rows = db.prepare(
    `SELECT c.band, o.horizon_h, o.price_usd, o.max_gain, o.max_loss, o.path_points, c.price_usd AS base, c.reasons, c.opportunity, c.risk
     FROM outcomes o JOIN candidates c ON c.id = o.candidate_id
     WHERE o.status = 'done' AND c.price_usd > 0`).all();
  const out = [];
  for (const [band] of config.bands) for (const h of config.outcome.horizonsHours) {
    const rs = rows.filter((r) => r.band === band && r.horizon_h === h);
    if (!rs.length) continue;
    const ch = rs.map((r) => (r.price_usd / r.base - 1) * 100);
    const withPath = rs.filter((r) => r.max_gain != null);
    out.push({
      band, horizon_h: h, count: ch.length, meanChangePct: ch.reduce((a, b) => a + b, 0) / ch.length,
      positiveShare: ch.filter((x) => x > 0).length / ch.length,
      hitUp20: share(withPath, up20), hitDown30: share(withPath, down30), pathCount: withPath.length,
    });
  }
  const buckets = new Map();
  for (const r of rows) {
    if (r.horizon_h !== 1 || r.max_gain == null) continue;
    const vals = {};
    try { for (const x of JSON.parse(r.reasons || '[]')) if (x.max > 0) vals[x.part] = x.points / x.max; } catch { /* old row without reasons */ }
    if (r.opportunity != null) vals.opportunity = r.opportunity / 100;
    if (r.risk != null) vals.risk = r.risk / 100;
    for (const [part, v] of Object.entries(vals)) {
      const key = `${part}|${v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    }
  }
  const parts = [...buckets].map(([key, rs]) => {
    const [part, third] = key.split('|');
    return { part, third: Number(third), count: rs.length, hitUp20: share(rs, up20), hitDown30: share(rs, down30) };
  }).sort((a, b) => a.part.localeCompare(b.part) || a.third - b.third);
  const thinPath = rows.filter((r) => r.path_points != null && r.path_points < 2).length;
  const missed = db.prepare("SELECT COUNT(*) c FROM outcomes WHERE status = 'missed'").get().c;
  return { rows: out, parts, thinPath, missed };
}
