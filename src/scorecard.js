import { config as defaultConfig } from './config.js';
import { median } from './market.js';

const sum = (xs, k) => xs.reduce((a, x) => a + (x[k] ?? 0), 0);

// trades: rows of one wallet {mint, side, token_amount, quote_usd, ts}.
export function scorecard(trades, config = defaultConfig) {
  const by = new Map();
  for (const t of trades) {
    if (!by.has(t.mint)) by.set(t.mint, { buy: [], sell: [], out: [] });
    by.get(t.mint)[t.side]?.push(t);
  }
  let bought = 0, held = 0, sold = 0, wins = 0;
  const holds = [];
  for (const g of by.values()) {
    if (!g.buy.length) continue;
    bought++;
    const net = sum(g.buy, 'token_amount') - sum(g.sell, 'token_amount') - sum(g.out, 'token_amount');
    if (net > 0) held++;
    if (!g.sell.length) continue;
    sold++;
    holds.push(Math.min(...g.sell.map((t) => t.ts)) - Math.min(...g.buy.map((t) => t.ts)));
    const share = Math.min(1, sum(g.sell, 'token_amount') / sum(g.buy, 'token_amount'));
    if (sum(g.sell, 'quote_usd') >= sum(g.buy, 'quote_usd') * share) wins++;
  }
  const medianHoldSeconds = median(holds);
  const sc = config.scorecard;
  const cls = holds.length >= sc.minHolds && medianHoldSeconds < sc.sniperHoldSeconds ? 'sniper' : bought < sc.ratedTrades ? 'unrated' : 'rated';
  return {
    bought, winRate: sold ? wins / sold : null, medianHoldSeconds,
    stillHoldingShare: bought ? held / bought : null,
    class: cls, weight: { sniper: 0, unrated: 0.5, rated: 1 }[cls],
  };
}

export const scorecardFor = (db, wallet, config) =>
  scorecard(db.prepare('SELECT mint, side, token_amount, quote_usd, ts FROM trades WHERE wallet = ?').all(wallet), config);
