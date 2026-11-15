import { classify } from './trades.js';
import { config as defaultConfig } from './config.js';

export function insertAlert(db, { ts, kind, mint = null, wallet = null, detail = {}, dedupe }) {
  return db.prepare('INSERT OR IGNORE INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,?,?,?,?,?)')
    .run(ts, kind, mint, wallet, JSON.stringify(detail), dedupe).changes > 0;
}

const MAX_NULL_CYCLES = 3;

// One wallet, one cycle. Returns the trades recorded. No backfill: first sight only sets the cursor.
export async function pollWallet({ db, rpc, wallet, tracked, solUsd, now, eligible = () => true, config = defaultConfig }) {
  const cur = db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(wallet)?.last_sig;
  const setCursor = db.prepare('INSERT INTO wallet_cursor(address, last_sig) VALUES (?,?) ON CONFLICT(address) DO UPDATE SET last_sig = excluded.last_sig');
  if (!cur) {
    const [first] = await rpc.signatures(wallet, { limit: 1 });
    if (first) setCursor.run(wallet, first.signature);
    return [];
  }
  const sigs = (await rpc.signatures(wallet, { limit: 20, until: cur })).reverse();
  const recorded = [];
  for (const s of sigs) {
    const tx = await rpc.transaction(s.signature);
    if (!tx) {
      // Fresh signatures can be unavailable; retry next cycle, give up after 3.
      const p = db.prepare('SELECT cycles FROM pending_sigs WHERE sig = ?').get(s.signature)?.cycles ?? 0;
      db.prepare('INSERT OR REPLACE INTO pending_sigs(sig, wallet, cycles) VALUES (?,?,?)').run(s.signature, wallet, p + 1);
      if (p + 1 < MAX_NULL_CYCLES) break;
      db.prepare('DELETE FROM pending_sigs WHERE sig = ?').run(s.signature);
      setCursor.run(wallet, s.signature);
      continue;
    }
    const ts = tx.blockTime ?? s.blockTime ?? Math.floor(now() / 1000);
    for (const t of classify(tx, wallet, solUsd)) {
      db.prepare('INSERT OR IGNORE INTO trades(sig, wallet, mint, side, token_amount, quote_usd, ts) VALUES (?,?,?,?,?,?,?)')
        .run(s.signature, wallet, t.mint, t.side, t.tokenAmount, t.quoteUsd, ts);
      recorded.push({ ...t, sig: s.signature, ts });
      if (tracked.has(wallet) && (t.side === 'buy' || t.side === 'sell')) {
        insertAlert(db, { ts, kind: t.side, mint: t.mint, wallet, detail: { usd: t.quoteUsd, sig: s.signature }, dedupe: `${t.side}:${s.signature}:${t.mint}` });
        if (t.side === 'buy') checkConsensus({ db, mint: t.mint, ts, tracked, eligible, config });
      }
    }
    setCursor.run(wallet, s.signature);
  }
  return recorded;
}

// Fires once per mint per window when enough eligible tracked wallets bought it.
export function checkConsensus({ db, mint, ts, tracked, eligible = () => true, config = defaultConfig }) {
  const win = config.consensus.windowMinutes * 60;
  const wallets = db.prepare(
    "SELECT DISTINCT wallet FROM trades WHERE mint = ? AND side = 'buy' AND ts BETWEEN ? AND ?").all(mint, ts - win, ts)
    .map((r) => r.wallet).filter((w) => tracked.has(w) && eligible(w));
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
}
