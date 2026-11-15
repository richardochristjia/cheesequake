import { config as defaultConfig, bandOf } from './config.js';
import { evaluate, CHEAP, isBondingCurve, top10Pct } from './vetoes.js';
import { scorecardFor } from './scorecard.js';
import { runThemes, themeOf } from './themes.js';
import { tokenBatch, boosts, profiles } from './sources/dexscreener.js';
import { poolsMulti } from './sources/geckoterminal.js';
import { fetchReport } from './sources/rugcheck.js';
import { scheduleOutcomes } from './outcomes.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);

// Pure: turns facts into a score. Each part is 0-1; a part that cannot be computed is 0 and "unknown".
export function scoreParts({ market: m, report, q = 0, consensus = false, deployerExit = false, theme = null, config = defaultConfig }) {
  const parts = {};
  const unknowns = [];
  const part = (name, value, note) => { parts[name] = { value: value ?? 0, note }; if (value == null) unknowns.push(name); };

  part('wallets', clamp((q + (consensus ? 1 : 0)) / 4), consensus ? `consensus alert, wallet weight ${q}` : `wallet weight ${q}`);

  const surge = div(m.buyers_h1, div(m.buyers_h6, 6));
  const ratio = div(m.buys_h1, (m.buys_h1 ?? 0) + (m.sells_h1 ?? 0));
  const top10 = top10Pct(report);
  part('health', surge == null || ratio == null || top10 == null ? null
    : (clamp((surge - 0.5) / 1.5) + clamp((ratio - 0.4) / 0.3) + clamp((25 - top10) / 25)) / 3,
  'buyer growth, buy share, top-10 holders');

  const creator = report?.creator;
  part('deployer', deployerExit ? 0 : !creator ? null : report.creatorBalance > 0 ? 1 : 0.5,
    deployerExit ? 'deployer has sold' : 'deployer still holding or quiet');

  const depth = div(m.liquidity_usd, m.mcap_usd);
  const locked = report?.lpLockedPct ?? null;
  const curve = isBondingCurve(m);
  part('liquidity', depth == null || (!curve && locked == null) ? null
    : curve ? clamp(depth / 0.1) : (clamp(depth / 0.1) + clamp(locked / 100)) / 2, 'liquidity depth and lock');

  const mo = div(m.vol_h1, div(m.vol_h6, 6));
  part('momentum', mo == null ? null : clamp((mo - 1) / 2), 'hourly volume against the 6-hour pace');

  part('narrative', theme ? (theme.share > theme.prevShare ? 1 : 0.5) : 0, theme ? `theme "${theme.keyword}"` : 'no theme');

  const w = config.weights;
  const reasons = Object.entries(parts).map(([p, { value, note }]) => ({
    part: p, points: Math.round(value * w[p] * 10) / 10, max: w[p],
    note: unknowns.includes(p) ? `unknown: ${note}` : note,
  }));
  return { score: Math.round(Object.entries(parts).reduce((a, [p, { value }]) => a + value * w[p], 0)), reasons, unknowns };
}

export const capScore = (score, unknowns, config = defaultConfig) => (unknowns.length ? Math.min(score, config.unknownCap) : score);

const safe = async (fn, fallback) => {
  try { return await fn(); } catch (e) {
    if (e.code === 'SOURCE_UNAVAILABLE') return fallback;
    throw e;
  }
};

function walletFacts(db, mint, tracked, nowS, config) {
  let q = 0;
  for (const w of tracked) {
    const rows = db.prepare('SELECT side, token_amount, ts FROM trades WHERE wallet = ? AND mint = ?').all(w, mint);
    const bought = rows.some((r) => r.side === 'buy' && r.ts > nowS - 86400);
    const net = rows.reduce((a, r) => a + (r.side === 'buy' ? r.token_amount : -r.token_amount), 0);
    if (bought && net > 0) q += scorecardFor(db, w, config).weight;
  }
  const has = (kind) => !!db.prepare('SELECT 1 FROM alerts WHERE kind = ? AND mint = ? AND ts > ?').get(kind, mint, nowS - 86400);
  return { q, consensus: has('consensus'), deployerExit: has('exit_deployer') };
}

const SNAP = ['pool', 'mint', 'symbol', 'name', 'dex', 'created_at', 'price_usd', 'fdv_usd', 'mcap_usd', 'liquidity_usd', 'vol_h1', 'vol_h6', 'vol_h24', 'buys_h1', 'sells_h1', 'buyers_h1', 'buyers_h6', 'chg_h1'];

function saveCandidate(db, ts, mint, m, { score, band, listed, vetoes, reasons = [], unknowns = [] }) {
  const id = db.prepare('INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(ts, mint, score, band, listed, JSON.stringify(vetoes), JSON.stringify(reasons), JSON.stringify(unknowns), m.price_usd ?? null, m.mcap_usd ?? null).lastInsertRowid;
  return Number(id);
}

// deps: {dexGet, geckoGet, rugGet, rpc}; tracked: wallet addresses from the user's file.
export async function runCandidates({ db, deps, tracked = [], now, config = defaultConfig }) {
  const nowMs = now();
  const nowS = Math.floor(nowMs / 1000);
  runThemes({ db, now: nowMs, config });

  // 1. Universe, tracked-wallet mints first, capped at 60.
  const tr = tracked.length ? db.prepare(
    `SELECT DISTINCT mint FROM trades WHERE side = 'buy' AND ts > ? AND wallet IN (${tracked.map(() => '?').join(',')})`).all(nowS - 86400, ...tracked).map((r) => r.mint) : [];
  const tsT = db.prepare("SELECT MAX(ts) t FROM pool_snapshots WHERE source = 'trending'").get().t;
  const trending = tsT ? db.prepare("SELECT mint FROM pool_snapshots WHERE source = 'trending' AND ts = ?").all(tsT).map((r) => r.mint) : [];
  const listings = [...(await safe(() => boosts(deps.dexGet), [])), ...(await safe(() => profiles(deps.dexGet), []))];
  const extra = listings.map((x) => x.mint);
  const descOf = new Map(listings.filter((x) => x.description).map((x) => [x.mint, x.description]));
  const universe = [...new Set([...tr, ...trending, ...extra])].filter(Boolean).slice(0, 60);
  if (!universe.length) return [];

  // 2. Market data. If this source is down the whole cycle is skipped (nothing to score).
  const markets = await tokenBatch(deps.dexGet, universe);

  // 3. Unique buyers: from the trending snapshot, else the pool batch endpoint, else unknown.
  const buyersOf = new Map();
  for (const mint of markets.keys()) {
    const s = tsT && db.prepare("SELECT buyers_h1, buyers_h6 FROM pool_snapshots WHERE source = 'trending' AND ts = ? AND mint = ?").get(tsT, mint);
    if (s && s.buyers_h1 != null) buyersOf.set(mint, s);
  }
  const missing = [...markets.values()].filter((m) => !buyersOf.has(m.mint) && m.pool);
  for (let i = 0; i < missing.length; i += 30) {
    const pools = await safe(() => poolsMulti(deps.geckoGet, missing.slice(i, i + 30).map((m) => m.pool)), []);
    for (const p of pools) if (p.mint && p.buyers_h1 != null) buyersOf.set(p.mint, p);
  }
  const insSnap = db.prepare(`INSERT INTO pool_snapshots(ts, source, ${SNAP.join(',')}) VALUES (?,?,${SNAP.map(() => '?').join(',')})`);
  for (const [mint, m] of markets) {
    const b = buyersOf.get(mint);
    m.buyers_h1 = b?.buyers_h1 ?? null;
    m.buyers_h6 = b?.buyers_h6 ?? null;
    insSnap.run(nowS, 'candidate', ...SNAP.map((c) => m[c] ?? null));
    if (descOf.has(mint)) db.prepare('INSERT INTO tokens(mint, symbol, name, description, first_seen) VALUES (?,?,?,?,?) ON CONFLICT(mint) DO UPDATE SET description = excluded.description').run(mint, m.symbol, m.name, descOf.get(mint), nowS);
  }

  const out = [];
  for (const [mint, m] of markets) {
    // 4. Cheap vetoes first.
    const cheap = evaluate({ market: m, now: nowMs, names: CHEAP, config });
    if (cheap.vetoes.length) { saveCandidate(db, nowS, mint, m, { score: 0, band: 'avoid', listed: 0, vetoes: cheap.vetoes, unknowns: cheap.unknowns }); continue; }

    // 5. Report (reused when under 10 minutes old) and mint info.
    const stored = db.prepare('SELECT ts, json FROM reports WHERE mint = ?').get(mint);
    let report = stored && nowS - stored.ts < 600 ? JSON.parse(stored.json) : await safe(() => fetchReport(deps.rugGet, mint), null);
    if (report && !(stored && nowS - stored.ts < 600)) db.prepare('INSERT OR REPLACE INTO reports(mint, ts, json) VALUES (?,?,?)').run(mint, nowS, JSON.stringify(report));
    const mintInfo = await safe(() => deps.rpc.mintInfo(mint), null);
    db.prepare('INSERT INTO tokens(mint, symbol, name, first_seen) VALUES (?,?,?,?) ON CONFLICT(mint) DO NOTHING').run(mint, m.symbol, m.name, nowS);
    if (report?.creator) db.prepare('UPDATE tokens SET creator = ? WHERE mint = ?').run(report.creator, mint);

    // 6. Remaining vetoes.
    const rest = evaluate({ market: m, report, mintInfo, now: nowMs, names: undefined, config });
    const vetoes = rest.vetoes;
    const unknowns = [...new Set([...cheap.unknowns, ...rest.unknowns])];
    if (vetoes.length) { saveCandidate(db, nowS, mint, m, { score: 0, band: 'avoid', listed: 0, vetoes, unknowns }); continue; }

    // 7-10. Score, cap, band, store.
    const facts = walletFacts(db, mint, tracked, nowS, config);
    const s = scoreParts({ market: m, report, ...facts, theme: themeOf(db, mint, nowMs), config });
    const allUnknown = [...new Set([...unknowns, ...s.unknowns])];
    const score = capScore(s.score, allUnknown, config);
    const id = saveCandidate(db, nowS, mint, m, { score, band: bandOf(score), listed: 1, vetoes: [], reasons: s.reasons, unknowns: allUnknown });
    scheduleOutcomes(db, id, mint, nowS, config);
    out.push({ mint, score });
  }
  return out;
}

// Latest listed row per mint from the last 30 minutes, best score first.
export function runningNow(db, now) {
  const since = Math.floor(now / 1000) - 1800;
  return db.prepare(
    `SELECT c.*, t.symbol, t.name, tt.keyword AS theme FROM candidates c
     JOIN (SELECT mint, MAX(id) id FROM candidates WHERE listed = 1 AND ts > ? GROUP BY mint) l ON l.id = c.id
     LEFT JOIN tokens t ON t.mint = c.mint LEFT JOIN token_theme tt ON tt.mint = c.mint
     ORDER BY c.score DESC`).all(since).map((r) => ({ ...r, reasons: JSON.parse(r.reasons), unknowns: JSON.parse(r.unknowns), vetoes: JSON.parse(r.vetoes) }));
}
