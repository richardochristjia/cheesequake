export const addr = (c) => c.repeat(4) + '1'.repeat(36);

export function tx({ wallet = addr('W'), mint = addr('M'), token = 100, sol = -1, blockTime = 1000 }) {
  return {
    blockTime,
    meta: {
      err: null, fee: 5000,
      preBalances: [10e9], postBalances: [10e9 + sol * 1e9 - 5000],
      preTokenBalances: [{ owner: wallet, mint, uiTokenAmount: { uiAmount: 0 } }],
      postTokenBalances: [{ owner: wallet, mint, uiTokenAmount: { uiAmount: token } }],
    },
    transaction: { message: { accountKeys: [{ pubkey: wallet, signer: true }] } },
  };
}


// Fake RPC: per wallet, a list of {signature, tx}. Cursor logic mimics getSignaturesForAddress.
export function fakeRpc(book) {
  const calls = { tx: 0 };
  return {
    calls,
    async signatures(w, { limit, until }) {
      const all = [...(book[w] || [])].reverse(); // newest first
      const i = until ? all.findIndex((s) => s.signature === until) : -1;
      return (i >= 0 ? all.slice(0, i) : all).slice(0, limit).map((s) => ({ signature: s.signature, blockTime: s.tx.blockTime }));
    },
    async transaction(sig) {
      calls.tx++;
      for (const l of Object.values(book)) { const f = l.find((s) => s.signature === sig); if (f) return f.tx; }
      return null;
    },
  };
}


