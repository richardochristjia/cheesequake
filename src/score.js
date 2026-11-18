import { config as defaultConfig, bandOf } from './config.js';
import { evaluate, CHEAP, isBondingCurve, top10Pct } from './vetoes.js';
import { scorecardFor } from './scorecard.js';
import { runThemes, themeOf } from './themes.js';
import { tokenBatch, boosts, profiles } from './sources/dexscreener.js';
import { poolsMulti } from './sources/geckoterminal.js';
import { fetchReport } from './sources/rugcheck.js';
import { scheduleOutcomes } from './outcomes.js';
import { storeSnapshots, upsertTokens } from './market.js';

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
  const volMo = mo == null ? null : clamp((mo - 1) / 2);
  const chgMo = m.chg_h1 == null ? null : clamp(m.chg_h1 / 50);
  const momentumVal = volMo != null && chgMo != null ? (volMo + chgMo) / 2 : (volMo ?? chgMo);
  part('momentum', momentumVal, 'hourly volume pace and 1h price change');

  part('narrative', theme ? (theme.share > theme.prevShare ? 1 : 0.5) : 0, theme ? `theme "${theme.keyword}"` : 'no theme');

  const w = config.weights;
  const reasons = Object.entries(parts).map(([p, { value, note }]) => ({
    part: p, points: Math.round(value * w[p] * 10) / 10, max: w[p],
    note: unknowns.includes(p) ? `unknown: ${note}` : note,
  }));
  return { score: Math.min(100, Math.round(Object.entries(parts).reduce((a, [p, { value }]) => a + value * w[p], 0))), reasons, unknowns };
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
    const recentBuys = rows.filter((r) => r.side === 'buy' && r.ts > nowS - 86400);
    const net = rows.reduce((a, r) => a + (r.side === 'buy' ? r.token_amount : -r.token_amount), 0);
    if (recentBuys.length && net > 0) {
      const latestBuyTs = Math.max(...recentBuys.map((r) => r.ts));
      const decay = clamp(1 - (nowS - latestBuyTs) / 86400);
      q += scorecardFor(db, w, config).weight * decay;
    }
  }
  q = Math.round(q * 100) / 100;
  const has = (kind) => !!db.prepare('SELECT 1 FROM alerts WHERE kind = ? AND mint = ? AND ts > ?').get(kind, mint, nowS - 86400);
  return { q, consensus: has('consensus'), deployerExit: has('exit_deployer') };
}

function saveCandidate(db, ts, mint, m, { score, band, listed, vetoes, reasons = [], unknowns = [] }) {
  const id = db.prepare('INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(ts, mint, score, band, listed, JSON.stringify(vetoes), JSON.stringify(reasons), JSON.stringify(unknowns), m.price_usd ?? null, m.mcap_usd ?? null).lastInsertRowid;
  return Number(id);
}

export function watchedMints(db) {
  return db.prepare('SELECT mint FROM watched_coins ORDER BY added_ts DESC').all().map((r) => r.mint);
}

// deps: {dexGet, geckoGet, rugGet, rpc}; tracked: wallet addresses from the user's file.
export async function runCandidates({ db, deps, tracked = [], now, config = defaultConfig }) {
  const nowMs = now();
  const nowS = Math.floor(nowMs / 1000);
  runThemes({ db, now: nowMs, config });

  // 1. Universe, watched mints first, then trending, then per-source shares of active new pools and weighted-wallet mints, boosts/profiles, leftovers; capped.
  const watched = watchedMints(db);
  const watchedSet = new Set(watched);
  const weightOf = new Map(tracked.map((w) => [w, scorecardFor(db, w, config).weight]));
  const byMint = new Map();
  const buys = tracked.length ? db.prepare(
    `SELECT mint, wallet, MAX(ts) last FROM trades WHERE side = 'buy' AND ts > ? AND wallet IN (${tracked.map(() => '?').join(',')}) GROUP BY mint, wallet`).all(nowS - 86400, ...tracked) : [];
  for (const { mint, wallet, last } of buys) {
    if (!(weightOf.get(wallet) > 0)) continue;
    const e = byMint.get(mint) ?? { mint, n: 0, last: 0 };
    e.n++; e.last = Math.max(e.last, last);
    byMint.set(mint, e);
  }
  const walletMints = [...byMint.values()].sort((a, b) => b.n - a.n || b.last - a.last).map((e) => e.mint);
  const tsT = db.prepare("SELECT MAX(ts) t FROM pool_snapshots WHERE source = 'trending'").get().t;
  const trending = tsT ? db.prepare("SELECT mint FROM pool_snapshots WHERE source = 'trending' AND ts = ?").all(tsT).map((r) => r.mint) : [];
  const tsN = db.prepare("SELECT MAX(ts) t FROM pool_snapshots WHERE source = 'new'").get().t;
  const newPools = tsN ? db.prepare("SELECT mint FROM pool_snapshots WHERE source = 'new' AND ts = ? AND COALESCE(buyers_h1, 0) >= ? AND COALESCE(liquidity_usd, 0) >= ? ORDER BY buyers_h1 DESC, rowid").all(tsN, config.veto.minBuyersH1, config.veto.minLiquidityUsd).map((r) => r.mint) : [];
  const listings = [...(await safe(() => boosts(deps.dexGet), [])), ...(await safe(() => profiles(deps.dexGet), []))];
  const extra = listings.map((x) => x.mint);
  const descOf = new Map(listings.filter((x) => x.description).map((x) => [x.mint, x.description]));
  const u = config.universe;
  const universe = [...new Set([...watched, ...trending, ...newPools.slice(0, u.newPools), ...walletMints.slice(0, u.wallets), ...extra,
    ...newPools.slice(u.newPools), ...walletMints.slice(u.wallets)])].filter(Boolean).slice(0, u.cap);
  if (!universe.length) return [];

  // 2. Market data. If this source is down the whole cycle is skipped (nothing to score).
  const markets = await tokenBatch(deps.dexGet, universe);

  // 3. Unique buyers: from the trending or new snapshot, else the pool batch endpoint, else unknown.
  const buyersOf = new Map();
  for (const mint of markets.keys()) {
    const s = (tsT && db.prepare("SELECT buyers_h1, buyers_h6 FROM pool_snapshots WHERE source = 'trending' AND ts = ? AND mint = ?").get(tsT, mint))
      || (tsN && db.prepare("SELECT buyers_h1, buyers_h6 FROM pool_snapshots WHERE source = 'new' AND ts = ? AND mint = ?").get(tsN, mint));
    if (s && s.buyers_h1 != null) buyersOf.set(mint, s);
  }
  const FILL = ['liquidity_usd', 'vol_h1', 'vol_h6', 'chg_h1'];
  const missing = [...markets.values()].filter((m) => m.pool && (!buyersOf.has(m.mint) || FILL.some((k) => m[k] == null)));
  const geckoOf = new Map();
  for (let i = 0; i < missing.length; i += 30) {
    const pools = await safe(() => poolsMulti(deps.geckoGet, missing.slice(i, i + 30).map((m) => m.pool)), []);
    for (const p of pools) if (p.mint) { geckoOf.set(p.mint, p); if (p.buyers_h1 != null && !buyersOf.has(p.mint)) buyersOf.set(p.mint, p); }
  }
  for (const [mint, m] of markets) {
    const b = buyersOf.get(mint);
    for (const k of FILL) m[k] ??= geckoOf.get(mint)?.[k] ?? null;
    m.buyers_h1 = b?.buyers_h1 ?? null;
    m.buyers_h6 = b?.buyers_h6 ?? null;
    if (descOf.has(mint)) db.prepare('INSERT INTO tokens(mint, symbol, name, description, first_seen, image_url) VALUES (?,?,?,?,?,?) ON CONFLICT(mint) DO UPDATE SET description = excluded.description, image_url = COALESCE(excluded.image_url, tokens.image_url)').run(mint, m.symbol, m.name, descOf.get(mint), nowS, m.image_url ?? null);
  }
  storeSnapshots(db, [...markets.values()], 'candidate', nowS);

  const out = [];
  for (const [mint, m] of markets) {
    // 4. Cheap vetoes first (watched mints continue to full veto evaluation).
    const cheap = evaluate({ market: m, now: nowMs, names: CHEAP, config });
    if (cheap.vetoes.length && !watchedSet.has(mint)) { saveCandidate(db, nowS, mint, m, { score: 0, band: 'avoid', listed: 0, vetoes: cheap.vetoes, unknowns: cheap.unknowns }); continue; }

    // 5. Report (reused when under 10 minutes old) and mint info.
    const stored = db.prepare('SELECT ts, json FROM reports WHERE mint = ?').get(mint);
    const fresh = stored && nowS - stored.ts < 600;
    const report = fresh ? JSON.parse(stored.json) : await safe(() => fetchReport(deps.rugGet, mint), null);
    if (report && !fresh) db.prepare('INSERT OR REPLACE INTO reports(mint, ts, json) VALUES (?,?,?)').run(mint, nowS, JSON.stringify(report));
    const mintInfo = await safe(() => deps.rpc.mintInfo(mint), null);
    upsertTokens(db, [m], nowS);
    if (report?.creator) db.prepare('UPDATE tokens SET creator = ? WHERE mint = ?').run(report.creator, mint);

    // 6. Remaining vetoes.
    const rest = evaluate({ market: m, report, mintInfo, now: nowMs, names: undefined, config });
    const exempt = (xs) => (watchedSet.has(mint) ? xs.filter((v) => v !== 'inactive') : xs);
    const vetoes = exempt([...new Set([...cheap.vetoes, ...rest.vetoes])]);
    const unknowns = exempt([...new Set([...cheap.unknowns, ...rest.unknowns])]);
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

// Latest row per mint from the last 30 minutes, kept only if listed, best score first.
export function runningNow(db, now) {
  const since = Math.floor(now / 1000) - 1800;
  const watchedSet = new Set(watchedMints(db));
  return db.prepare(
    `SELECT c.*, t.symbol, t.name, t.image_url, tt.keyword AS theme FROM candidates c
     JOIN (SELECT mint, MAX(id) id FROM candidates WHERE ts > ? GROUP BY mint) l ON l.id = c.id
     LEFT JOIN tokens t ON t.mint = c.mint LEFT JOIN token_theme tt ON tt.mint = c.mint
     WHERE c.listed = 1
     ORDER BY c.score DESC`).all(since).map((r) => ({
    ...r,
    watched: watchedSet.has(r.mint),
    reasons: JSON.parse(r.reasons),
    unknowns: JSON.parse(r.unknowns),
    vetoes: JSON.parse(r.vetoes),
  }));
}

const usd = (n) => (n == null ? null : '$' + Math.round(Number(n)).toLocaleString('en-US'));

function vetoReason(v, snap, rep, config) {
  if (v === 'mint_authority') return 'Mint authority is still active (new tokens can be minted)';
  if (v === 'freeze_authority') return 'Freeze authority is still active (wallets can be frozen)';
  if (v === 'rugged') {
    const dangers = (rep?.risks || []).filter((r) => r.level === 'danger' && r.name).map((r) => r.name);
    return 'Flagged as rugged or high danger by RugCheck' + (dangers.length ? ` (${dangers.join(', ')})` : '');
  }
  if (v === 'transfer_fee') return 'Token charges a transfer fee' + (rep?.transferFeePct > 0 ? ` (${rep.transferFeePct}%)` : '');
  if (v === 'lp_unlocked') return 'Liquidity pool is not sufficiently locked' + (rep?.lpLockedPct != null ? ` (${Math.round(rep.lpLockedPct)}% locked, min ${config.veto.minLpLockedPct}%)` : '');
  if (v === 'top10') {
    const pct = top10Pct(rep);
    return 'Top 10 holders own too much of the supply' + (pct != null ? ` (${Math.round(pct * 10) / 10}%, max ${config.veto.maxTop10Pct}%)` : '');
  }
  if (v === 'insiders') return 'Insider wallets hold too much of the supply';
  if (v === 'liquidity') return 'Pool liquidity is below the safety minimum' + (snap?.liquidity_usd != null ? ` (${usd(snap.liquidity_usd)}, min ${usd(config.veto.minLiquidityUsd)})` : '');
  if (v === 'age') return `Coin is newer than the minimum age threshold (${config.veto.minAgeMinutes} min)`;
  if (v === 'wash') return 'Suspected wash trading (high volume with too few buyers)';
  if (v === 'inactive') return `No recent trading activity (fewer than ${config.veto.minBuyersH1} buyers in the last hour)`;
  return `Safety check failed: ${v}`;
}

function exitReason(k, d = {}) {
  if (k === 'exit_deployer') return 'Creator wallet sold or moved tokens in the last 24 hours' + (d.usd != null ? ` (${usd(d.usd)})` : d.side ? ` (${d.side})` : '');
  if (k === 'exit_liquidity') return 'Sharp liquidity drop detected in the last 24 hours' + (d.from != null && d.to != null ? ` (${usd(d.from)} to ${usd(d.to)})` : '');
  if (k === 'exit_wallet') return 'Tracked wallet sold this coin in the last 24 hours' + (d.usd != null ? ` (${usd(d.usd)})` : '');
  if (k === 'exit_divergence') return 'Volume rose while unique buyers fell in the last 24 hours' + (d.vol != null && d.buyers != null ? ` (${usd(d.vol)} 1h vol, ${d.buyers} buyers)` : '');
  return k;
}

export function enrichAlert(a, labelOf) {
  const detail = typeof a.detail === 'string' ? JSON.parse(a.detail || '{}') : { ...(a.detail || {}) };
  if (a.kind === 'consensus') {
    const wallet_labels = {};
    for (const w of Array.isArray(detail.wallets) ? detail.wallets : []) {
      const l = labelOf.get(w);
      if (l) wallet_labels[w] = l;
    }
    detail.wallet_labels = wallet_labels;
  }
  return { ...a, wallet_label: (a.wallet && labelOf.get(a.wallet)) || null, detail };
}

export function watchList(db, now, config = defaultConfig, wallets = []) {
  const nowS = Math.floor(now / 1000);
  const labelOf = wallets instanceof Map ? wallets : new Map((wallets || []).filter((w) => w?.label).map((w) => [w.address, w.label]));
  const rows = db.prepare('SELECT mint, added_ts FROM watched_coins ORDER BY added_ts DESC').all();
  const getTok = db.prepare('SELECT symbol, name, creator, image_url FROM tokens WHERE mint = ?');
  const getSnap = db.prepare('SELECT pool, symbol, name, price_usd, mcap_usd, liquidity_usd, vol_h24, ts FROM pool_snapshots WHERE mint = ? ORDER BY ts DESC LIMIT 1');
  const getCand = db.prepare('SELECT ts, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd FROM candidates WHERE mint = ? ORDER BY id DESC LIMIT 1');
  const getRep = db.prepare('SELECT json FROM reports WHERE mint = ?');
  const getAlerts = db.prepare('SELECT ts, kind, mint, wallet, detail FROM alerts WHERE mint = ? ORDER BY ts DESC, id DESC LIMIT 50');
  const getExits = db.prepare("SELECT kind, detail FROM alerts WHERE mint = ? AND ts > ? AND kind LIKE 'exit_%' ORDER BY ts DESC, id DESC");

  return rows.map(({ mint, added_ts }) => {
    const tok = getTok.get(mint);
    const snap = getSnap.get(mint);
    const cand = getCand.get(mint);
    const repRow = getRep.get(mint);
    const rep = repRow ? JSON.parse(repRow.json || 'null') : null;
    const alerts = getAlerts.all(mint).map((a) => enrichAlert(a, labelOf));
    const exitByKind = new Map();
    for (const r of getExits.all(mint, nowS - 86400)) {
      if (!exitByKind.has(r.kind)) exitByKind.set(r.kind, JSON.parse(r.detail || '{}'));
    }
    const vetoes = cand ? JSON.parse(cand.vetoes || '[]') : [];
    const unknowns = cand ? JSON.parse(cand.unknowns || '[]') : [];
    const scoreReasons = cand ? JSON.parse(cand.reasons || '[]') : [];
    const hasAlert = (k) => exitByKind.has(k);

    const flagVetoes = vetoes.filter((v) => v !== 'age');
    const isFlag = flagVetoes.length > 0 || hasAlert('exit_deployer') || hasAlert('exit_liquidity');
    const isCaution = !isFlag && (!cand || hasAlert('exit_wallet') || hasAlert('exit_divergence') || vetoes.includes('age') || cand.score < 45 || unknowns.length > 0);
    const status = isFlag ? 'flag' : isCaution ? 'caution' : 'safe';
    const label = status === 'flag' ? 'Red flag' : status === 'caution' ? 'Caution' : 'Safe to hold';

    const reasons = [];
    if (!cand) reasons.push('Waiting for first safety scan');
    for (const v of vetoes) reasons.push(vetoReason(v, snap, rep, config));
    for (const k of ['exit_deployer', 'exit_liquidity', 'exit_wallet', 'exit_divergence']) {
      if (hasAlert(k)) reasons.push(exitReason(k, exitByKind.get(k)));
    }
    if (cand && !vetoes.length && cand.score < 45) reasons.push(`Score is low (${cand.score}/100)`);
    if (cand && unknowns.length > 0) reasons.push(`Missing safety or market data: ${unknowns.join(', ')}`);
    if (!reasons.length) reasons.push('Passed all safety checks with no recent exit alerts');

    return {
      mint,
      added_ts,
      symbol: tok?.symbol ?? snap?.symbol ?? null,
      name: tok?.name ?? snap?.name ?? null,
      creator: tok?.creator ?? null,
      pool: snap?.pool ?? null,
      price_usd: snap?.price_usd ?? cand?.price_usd ?? null,
      mcap_usd: snap?.mcap_usd ?? cand?.mcap_usd ?? null,
      liquidity_usd: snap?.liquidity_usd ?? null,
      vol_h24: snap?.vol_h24 ?? null,
      image_url: tok?.image_url ?? null,
      score: cand ? cand.score : null,
      band: cand ? cand.band : null,
      ts: cand ? cand.ts : null,
      vetoes,
      unknowns,
      scoreReasons,
      status,
      label,
      reasons,
      alerts,
    };
  });
}
