import { classify } from './trades.js';
import { scorecardFor } from './scorecard.js';
import { config as defaultConfig } from './config.js';
import { tokenBatch } from './sources/dexscreener.js';
import { storeSnapshots } from './market.js';
import { watchedMints } from './score.js';

export function insertAlert(db, { ts, kind, mint = null, wallet = null, detail = {}, dedupe }) {
  return db.prepare('INSERT OR IGNORE INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,?,?,?,?,?)')
    .run(ts, kind, mint, wallet, JSON.stringify(detail), dedupe).changes > 0;
}

const MAX_NULL_CYCLES = 3;

// One wallet, one cycle. Returns the trades recorded. Tracked wallets backfill silently on first sight; untracked only set the cursor.
export async function pollWallet({ db, rpc, wallet, tracked, solUsd, now, eligible = (w) => scorecardFor(db, w, config).class !== 'sniper', config = defaultConfig }) {
  const cur = db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(wallet)?.last_sig;
  const setCursor = db.prepare('INSERT INTO wallet_cursor(address, last_sig) VALUES (?,?) ON CONFLICT(address) DO UPDATE SET last_sig = excluded.last_sig');
  if (!cur && !tracked.has(wallet)) {
    const [first] = await rpc.signatures(wallet, { limit: 1 });
    if (first) setCursor.run(wallet, first.signature);
    return [];
  }
  const backfill = !cur;
  const { sigLimit = 100, txLimit = 20, backfillTxLimit = 20 } = config.walletPoll ?? defaultConfig.walletPoll;
  const maxTx = backfill ? backfillTxLimit : txLimit;
  const allSigs = await rpc.signatures(wallet, { limit: sigLimit, ...(cur ? { until: cur } : {}) });
  let ok = 0;
  const sigs = allSigs.filter((s) => s.err != null || ++ok <= maxTx).reverse();
  const recorded = [];
  const advance = (sig) => { if (!backfill) setCursor.run(wallet, sig); };
  let lastSig = null;
  let paused = false;
  for (const s of sigs) {
    if (s.err != null) {
      advance(s.signature);
      lastSig = s.signature;
      continue;
    }
    const tx = await rpc.transaction(s.signature);
    if (!tx) {
      // Fresh signatures can be unavailable; retry next cycle, give up after 3.
      const p = db.prepare('SELECT cycles FROM pending_sigs WHERE sig = ?').get(s.signature)?.cycles ?? 0;
      db.prepare('INSERT OR REPLACE INTO pending_sigs(sig, wallet, cycles) VALUES (?,?,?)').run(s.signature, wallet, p + 1);
      if (p + 1 < MAX_NULL_CYCLES) { paused = true; break; }
      db.prepare('DELETE FROM pending_sigs WHERE sig = ?').run(s.signature);
      advance(s.signature);
      lastSig = s.signature;
      continue;
    }
    const ts = tx.blockTime ?? s.blockTime ?? Math.floor(now() / 1000);
    for (const t of classify(tx, wallet, solUsd)) {
      db.prepare('INSERT OR IGNORE INTO trades(sig, wallet, mint, side, token_amount, quote_usd, ts) VALUES (?,?,?,?,?,?,?)')
        .run(s.signature, wallet, t.mint, t.side, t.tokenAmount, t.quoteUsd, ts);
      recorded.push({ ...t, sig: s.signature, ts });
      if (backfill && (t.side === 'sell' || t.side === 'out')) {
        db.prepare('INSERT OR IGNORE INTO pending_sigs(sig, wallet, cycles) VALUES (?,?,0)')
          .run(`backfill:${s.signature}:${t.mint}`, wallet);
      }
      if (!backfill && tracked.has(wallet) && (t.side === 'buy' || t.side === 'sell')) {
        insertAlert(db, { ts, kind: t.side, mint: t.mint, wallet, detail: { usd: t.quoteUsd, sig: s.signature }, dedupe: `${t.side}:${s.signature}:${t.mint}` });
        if (t.side === 'buy') checkConsensus({ db, mint: t.mint, ts, tracked, eligible, config });
      }
    }
    advance(s.signature);
    lastSig = s.signature;
  }
  if (backfill && !paused && lastSig) setCursor.run(wallet, lastSig);
  return recorded;
}

// Fires once per mint per window when enough eligible tracked wallets bought it.
export function checkConsensus({ db, mint, ts, tracked, eligible = () => true, config = defaultConfig }) {
  const win = config.consensus.windowMinutes * 60;
  const buys = db.prepare(
    "SELECT wallet, ts FROM trades WHERE mint = ? AND side = 'buy' AND ts BETWEEN ? AND ?").all(mint, ts - win, ts + win)
    .filter((r) => tracked.has(r.wallet) && eligible(r.wallet));
  // Any span of `win` seconds holding enough distinct wallets counts, so polling order does not matter.
  const inSpan = (s) => [...new Set(buys.filter((r) => r.ts >= s && r.ts <= s + win).map((r) => r.wallet))];
  const wallets = buys.map((r) => inSpan(r.ts)).sort((a, b) => b.length - a.length)[0] ?? [];
  if (wallets.length < config.consensus.wallets) return false;
  const exists = db.prepare("SELECT 1 FROM alerts WHERE kind = 'consensus' AND mint = ? AND ts > ?").get(mint, ts - win);
  if (exists) return false;
  const mcap = db.prepare('SELECT mcap_usd FROM pool_snapshots WHERE mint = ? ORDER BY ts DESC LIMIT 1').get(mint)?.mcap_usd ?? null;
  return insertAlert(db, { ts, kind: 'consensus', mint, detail: { wallets, mcap }, dedupe: `consensus:${mint}:${Math.floor(ts / win)}:${ts}` });
}

export async function runWalletCycle({ db, rpc, tracked, deployers = [], solUsd, now, eligible, config = defaultConfig }) {
  const set = new Set(tracked);
  const all = [...new Set([...tracked, ...deployers])];
  for (const wallet of all) {
    try {
      await pollWallet({ db, rpc, wallet, tracked: set, solUsd, now, eligible, config });
    } catch (e) {
      console.error(`ping: ${wallet.slice(0, 6)}… ${e.message}`);
    }
  }
  try { checkExits({ db, tracked, now: now(), config }); } catch (e) { console.error(`ping: exits ${e.message}`); }
}

// Deployers of the 20 best candidates listed in the last 24 h plus watched coins (watched for their own sells).
export function deployerWallets(db, now) {
  const top = db.prepare(
    `SELECT t.creator FROM candidates c JOIN tokens t ON t.mint = c.mint
     WHERE c.listed = 1 AND c.ts > ? AND t.creator IS NOT NULL
     GROUP BY c.mint ORDER BY MAX(c.score) DESC LIMIT 20`).all(Math.floor(now / 1000) - 86400).map((r) => r.creator);
  const watched = db.prepare(
    'SELECT t.creator FROM watched_coins w JOIN tokens t ON t.mint = w.mint WHERE t.creator IS NOT NULL').all().map((r) => r.creator);
  return [...new Set([...top, ...watched])];
}

// Every 60 s: one DexScreener batch for watched coins, stored as 'watch' snapshots, then exit checks.
export async function refreshWatched({ db, dexGet, tracked = [], now, config = defaultConfig }) {
  const mints = watchedMints(db);
  if (!mints.length) return 0;
  const m = await tokenBatch(dexGet, mints);
  storeSnapshots(db, [...m.values()], 'watch', Math.floor(now() / 1000));
  checkExits({ db, tracked, now: now(), config });
  return m.size;
}

// Exit alerts for mints listed in the last 24 h or in watched_coins. Deduped per kind, mint, wallet and hour.
export function checkExits({ db, tracked, now, config = defaultConfig }) {
  const nowS = Math.floor(now / 1000);
  const mints = db.prepare(
    `SELECT m.mint, t.creator FROM (
       SELECT DISTINCT mint FROM candidates WHERE listed = 1 AND ts > ?
       UNION
       SELECT mint FROM watched_coins
     ) m LEFT JOIN tokens t ON t.mint = m.mint`).all(nowS - 86400);
  const trackedSet = new Set(tracked);
  const fire = (kind, mint, wallet, ts, detail) =>
    insertAlert(db, { ts, kind, mint, wallet, detail, dedupe: `${kind}:${mint}:${wallet ?? ''}:${Math.floor(ts / 3600)}` });
  const trades = db.prepare(
    `SELECT wallet, side, ts, quote_usd FROM trades
     WHERE mint = ? AND side IN ('sell','out')
       AND NOT EXISTS (SELECT 1 FROM pending_sigs WHERE sig = 'backfill:' || trades.sig || ':' || trades.mint)`);
  const snaps = db.prepare('SELECT ts, pool, liquidity_usd, vol_h1, buyers_h1, chg_m5 FROM pool_snapshots WHERE mint = ? ORDER BY ts DESC');
  for (const { mint, creator } of mints) {
    for (const t of trades.all(mint)) {
      if (t.wallet === creator) fire('exit_deployer', mint, t.wallet, t.ts, { side: t.side, usd: t.quote_usd });
      else if (t.side === 'sell' && trackedSet.has(t.wallet)) fire('exit_wallet', mint, t.wallet, t.ts, { usd: t.quote_usd });
    }
    const all = snaps.all(mint);
    const latest = all[0];
    if (!latest) continue;
    if (latest.chg_m5 != null && latest.chg_m5 <= config.exit.dropM5Pct)
      fire('exit_drop', mint, null, latest.ts, { chg_m5: latest.chg_m5 });
    // DexScreener 'watch' rows carry no buyers, so divergence compares the latest row that has them.
    const latestB = all.find((s) => s.buyers_h1 != null);
    const before = latestB && all.filter((s) => s !== latestB && s.ts <= latestB.ts - 1800)
      .sort((a, b) => Math.abs(a.ts - (latestB.ts - 3600)) - Math.abs(b.ts - (latestB.ts - 3600)))[0];
    const peak = Math.max(0, ...all.slice(1)
      .filter((s) => s.pool === latest.pool && s.ts >= latest.ts - config.drawdown.windowMinutes * 60 && s.ts < latest.ts)
      .map((s) => s.liquidity_usd ?? 0));
    if (latest.liquidity_usd != null && peak > 0 && latest.liquidity_usd <= peak * (1 - config.exit.liquidityDropShare))
      fire('exit_liquidity', mint, null, latest.ts, { from: peak, to: latest.liquidity_usd });
    if (!before) continue;
    if (latestB.vol_h1 != null && before.vol_h1 != null && before.buyers_h1 != null
        && latestB.vol_h1 > before.vol_h1 && latestB.buyers_h1 < before.buyers_h1)
      fire('exit_divergence', mint, null, latestB.ts, { vol: latestB.vol_h1, buyers: latestB.buyers_h1 });
  }
}
