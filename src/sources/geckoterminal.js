const BASE = 'https://api.geckoterminal.com/api/v2/networks/solana';

// Strings and nulls in, number or null out. Never NaN, never 0 for "missing".
export const num = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

export function parsePool(p) {
  const a = p.attributes || {};
  const tx = a.transactions || {};
  const mint = p.relationships?.base_token?.data?.id?.replace(/^solana_/, '') ?? null;
  const created = a.pool_created_at ? Date.parse(a.pool_created_at) / 1000 : null;
  return {
    pool: a.address ?? null,
    mint,
    symbol: (a.name || '').split(' / ')[0] || null,
    name: a.name ?? null,
    dex: p.relationships?.dex?.data?.id ?? null,
    created_at: Number.isFinite(created) ? created : null,
    price_usd: num(a.base_token_price_usd),
    fdv_usd: num(a.fdv_usd),
    mcap_usd: num(a.market_cap_usd),
    liquidity_usd: num(a.reserve_in_usd),
    vol_h1: num(a.volume_usd?.h1),
    vol_h6: num(a.volume_usd?.h6),
    vol_h24: num(a.volume_usd?.h24),
    buys_h1: num(tx.h1?.buys),
    sells_h1: num(tx.h1?.sells),
    buyers_h1: num(tx.h1?.buyers),
    buyers_h6: num(tx.h6?.buyers),
    chg_h1: num(a.price_change_percentage?.h1),
    sol_usd: p.relationships?.quote_token?.data?.id?.endsWith('So11111111111111111111111111111111111111112')
      ? num(a.quote_token_price_usd) : null,
  };
}

const list = (body) => (Array.isArray(body?.data) ? body.data.map(parsePool) : []);

export const newPools = async (get) => list(await get(`${BASE}/new_pools?page=1`));
export const trendingPools = async (get) => list(await get(`${BASE}/trending_pools?page=1`));
// Not probed against the live API: callers treat a failure or odd shape as "unknown".
export const poolsMulti = async (get, addresses) =>
  list(await get(`${BASE}/pools/multi/${addresses.join(',')}`));
// Not probed beyond one manual check; odd bodies give [] or skip rows. Null and "missing" placeholders give no image.
export const tokensMulti = async (get, addresses) => {
  const body = await get(`${BASE}/tokens/multi/${addresses.join(',')}`);
  return (Array.isArray(body?.data) ? body.data : []).map((t) => {
    const a = t?.attributes || {};
    const url = typeof a.image_url === 'string' && !/missing/i.test(a.image_url) ? a.image_url : null;
    return { mint: a.address ?? t?.id?.replace(/^solana_/, '') ?? null, image_url: url };
  }).filter((x) => x.mint && x.image_url);
};
