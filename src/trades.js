export const WSOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KNYQNR4KSB7QQ3xAPbmN';

export const key = (k) => (typeof k === 'string' ? k : k.pubkey);

// Token balance change per mint for one owner (missing entry counts as 0).
export function tokenDeltas(meta, owner) {
  const d = {};
  const add = (list, sign) => {
    for (const e of list || []) if (e.owner === owner) d[e.mint] = (d[e.mint] ?? 0) + sign * (e.uiTokenAmount?.uiAmount ?? 0);
  };
  add(meta.postTokenBalances, 1);
  add(meta.preTokenBalances, -1);
  return d;
}

export function nativeDelta(tx, owner) {
  const keys = tx.transaction.message.accountKeys.map(key);
  const i = keys.indexOf(owner);
  if (i < 0) return 0;
  const m = tx.meta;
  return (m.postBalances[i] - m.preBalances[i] + (i === 0 ? m.fee : 0)) / 1e9;
}

export function classify(tx, wallet, solUsd) {
  if (!tx || tx.meta?.err) return [];
  const d = tokenDeltas(tx.meta, wallet);
  const quoteUsd = (nativeDelta(tx, wallet) + (d[WSOL] ?? 0)) * solUsd + (d[USDC] ?? 0) + (d[USDT] ?? 0);
  const mints = Object.keys(d).filter((m) => ![WSOL, USDC, USDT].includes(m) && d[m] !== 0);
  const out = [];
  for (const mint of mints) {
    const delta = d[mint];
    let side = null;
    if (delta > 0 && quoteUsd < -0.5) side = 'buy';
    else if (delta < 0) side = quoteUsd > 0.5 ? 'sell' : 'out';
    if (side) out.push({ mint, side, tokenAmount: Math.abs(delta), quoteUsd: Math.abs(quoteUsd) / mints.length });
  }
  return out;
}
