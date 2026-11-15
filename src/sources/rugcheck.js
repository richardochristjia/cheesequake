const BASE = 'https://api.rugcheck.xyz/v1/tokens';

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
// undefined = the report did not say; null = revoked; string = active authority.
const authority = (raw, k) => (k in raw ? raw[k] ?? null : undefined);

// Reads defensively: a field of an unexpected type becomes null ("unknown").
export function normalise(raw) {
  if (!isObj(raw)) return null;
  const markets = Array.isArray(raw.markets) ? raw.markets.filter((m) => isObj(m?.lp) && n(m.lp.lpLockedPct) !== null) : [];
  const size = (m) => (n(m.lp.quoteUSD) ?? 0) + (n(m.lp.baseUSD) ?? 0);
  const main = markets.sort((a, b) => size(b) - size(a))[0];
  const nets = Array.isArray(raw.insiderNetworks) ? raw.insiderNetworks : [];
  return {
    mint: raw.mint ?? null,
    creator: typeof raw.creator === 'string' ? raw.creator : null,
    creatorBalance: n(raw.creatorBalance),
    mintAuthority: authority(raw, 'mintAuthority'),
    freezeAuthority: authority(raw, 'freezeAuthority'),
    rugged: raw.rugged === true,
    risks: Array.isArray(raw.risks) ? raw.risks.map((r) => ({ name: r?.name, level: r?.level })) : [],
    transferFeePct: isObj(raw.transferFee) ? n(raw.transferFee.pct) ?? 0 : 0,
    lpLockedPct: main ? main.lp.lpLockedPct : null,
    topHolders: Array.isArray(raw.topHolders) ? raw.topHolders.map((h) => ({ address: h?.address, owner: h?.owner, pct: n(h?.pct) ?? 0 })) : null,
    knownAccounts: isObj(raw.knownAccounts) ? Object.keys(raw.knownAccounts) : [],
    insiderNetworks: nets.length,
    insiderHolding: nets.reduce((a, x) => a + (n(x?.currentHolding) ?? 0), 0),
    supply: isObj(raw.token) ? n(raw.token.supply) : null,
  };
}

export async function fetchReport(get, mint) {
  return normalise(await get(`${BASE}/${mint}/report`));
}
