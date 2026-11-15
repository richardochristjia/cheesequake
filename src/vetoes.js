import { config as defaultConfig } from './config.js';

const BONDING = ['pumpfun', 'pump-fun'];
export const isBondingCurve = (market) => BONDING.includes(market?.dex);

// Each rule returns 'veto', 'unknown' or null (pass).
const rules = (c) => ({
  mint_authority: ({ report, mintInfo }) => authority('mintAuthority', report, mintInfo),
  freeze_authority: ({ report, mintInfo }) => authority('freezeAuthority', report, mintInfo),
  rugged: ({ report }) => (!report ? 'unknown' : report.rugged || report.risks.some((r) => r.level === 'danger') ? 'veto' : null),
  transfer_fee: ({ report }) => (!report ? 'unknown' : report.transferFeePct > 0 ? 'veto' : null),
  lp_unlocked: ({ report, market }) => {
    if (isBondingCurve(market)) return null;
    if (!report || report.lpLockedPct === null) return 'unknown';
    return report.lpLockedPct < c.veto.minLpLockedPct ? 'veto' : null;
  },
  top10: ({ report }) => {
    if (!report?.topHolders) return 'unknown';
    const known = new Set(report.knownAccounts);
    const sum = report.topHolders.filter((h) => !known.has(h.address) && !known.has(h.owner)).slice(0, 10).reduce((a, h) => a + h.pct, 0);
    return sum > c.veto.maxTop10Pct ? 'veto' : null;
  },
  insiders: ({ report, mintInfo }) => {
    if (!report) return 'unknown';
    if (!report.insiderNetworks) return null;
    const supply = mintInfo?.supply ?? report.supply;
    if (!supply) return 'unknown';
    return (report.insiderHolding / supply) * 100 > c.veto.maxInsiderPct ? 'veto' : null;
  },
  liquidity: ({ market }) => (market?.liquidity_usd == null ? 'unknown' : market.liquidity_usd < c.veto.minLiquidityUsd ? 'veto' : null),
  age: ({ market, now }) =>
    market?.created_at == null ? 'unknown' : (now / 1000 - market.created_at) / 60 < c.veto.minAgeMinutes ? 'veto' : null,
  wash: ({ market: m }) => {
    if (m?.buyers_h1 == null) return 'unknown';
    const surge = m.buyers_h6 != null && m.vol_h1 > (1.5 * m.vol_h6) / 6 && m.buyers_h1 < m.buyers_h6 / 6;
    const thin = m.buyers_h1 < c.veto.washMinBuyers && m.vol_h1 > c.veto.washVolumeUsd;
    return surge || thin ? 'veto' : null;
  },
});

// Either source saying "active" means active; a mismatch counts as active.
function authority(key, report, mintInfo) {
  const vals = [report?.[key], mintInfo?.[key]].filter((v) => v !== undefined);
  if (vals.some((v) => v !== null)) return 'veto';
  return vals.length ? null : 'unknown';
}

export const CHEAP = ['liquidity', 'age', 'wash'];

// `names` limits which rules run (the pipeline runs the cheap ones first).
export function evaluate({ market, report = null, mintInfo = null, now, names, config = defaultConfig }) {
  const r = rules(config);
  const out = { vetoes: [], unknowns: [] };
  for (const name of names ?? Object.keys(r)) {
    const v = r[name]({ market, report, mintInfo, now });
    if (v === 'veto') out.vetoes.push(name);
    else if (v === 'unknown') out.unknowns.push(name);
  }
  return out;
}
