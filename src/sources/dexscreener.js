import { num } from './geckoterminal.js';

const BASE = 'https://api.dexscreener.com';

export function parsePair(p) {
  return {
    pool: p.pairAddress ?? null,
    mint: p.baseToken?.address ?? null,
    symbol: p.baseToken?.symbol ?? null,
    name: p.baseToken?.name ?? null,
    dex: p.dexId ?? null,
    created_at: num(p.pairCreatedAt) === null ? null : p.pairCreatedAt / 1000,
    price_usd: num(p.priceUsd),
    fdv_usd: num(p.fdv),
    mcap_usd: num(p.marketCap),
    liquidity_usd: num(p.liquidity?.usd),
    vol_h1: num(p.volume?.h1),
    vol_h6: num(p.volume?.h6),
    vol_h24: num(p.volume?.h24),
    buys_h1: num(p.txns?.h1?.buys),
    sells_h1: num(p.txns?.h1?.sells),
    buyers_h1: null, // DexScreener gives trade counts, not unique buyers
    buyers_h6: null,
    chg_h1: num(p.priceChange?.h1),
    chg_m5: num(p.priceChange?.m5),
    image_url: p.info?.imageUrl ?? null,
  };
}

// Returns Map<mint, best pair by liquidity>. Up to 30 mints per call.
export async function tokenBatch(get, mints) {
  const best = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    const body = await get(`${BASE}/tokens/v1/solana/${mints.slice(i, i + 30).join(',')}`);
    for (const raw of Array.isArray(body) ? body : []) {
      if (raw.chainId !== 'solana') continue;
      const p = parsePair(raw);
      if (!p.mint) continue;
      const cur = best.get(p.mint);
      if (!cur || (p.liquidity_usd ?? -1) > (cur.liquidity_usd ?? -1)) best.set(p.mint, p);
    }
  }
  return best;
}

const solanaList = (body) =>
  (Array.isArray(body) ? body : [])
    .filter((x) => x.chainId === 'solana' && x.tokenAddress)
    .map((x) => ({ mint: x.tokenAddress, description: x.description ?? null }));

export const boosts = async (get) => solanaList(await get(`${BASE}/token-boosts/top/v1`));
export const profiles = async (get) => solanaList(await get(`${BASE}/token-profiles/latest/v1`));
