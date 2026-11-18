// Every number here is a project default, untested until history exists.
const env = process.env;
const s = (n) => n * 1000;

export const config = Object.freeze({
  rpcUrl: env.CHEESEQUAKE_RPC_URL || 'https://api.mainnet-beta.solana.com',
  port: Number(env.CHEESEQUAKE_PORT) || 4777,
  dbPath: env.CHEESEQUAKE_DB || 'data/cheesequake.db',
  walletsPath: env.CHEESEQUAKE_WALLETS || 'wallets.txt',
  labelsPath: 'data/labels.json',
  pace: { geckoterminal: s(3), dexscreener: s(1), rugcheck: s(1), rpc: 500 }, // ms between calls
  retry: { tries: 4, waitsMs: [s(5), s(15), s(45)] },
  intervals: { newPools: s(60), trending: s(300), candidates: s(300), wallets: s(60), outcomes: s(300) },
  index: { windowHours: 720, warmupHours: 168 },
  veto: {
    minLiquidityUsd: 10000, minAgeMinutes: 5, minLpLockedPct: 80, maxTop10Pct: 25,
    maxInsiderPct: 20, washMinBuyers: 10, washVolumeUsd: 50000,
  },
  consensus: { wallets: 3, windowMinutes: 60 },
  scorecard: { sniperHoldSeconds: 300, minHolds: 3, ratedTrades: 10 },
  weights: { wallets: 20, health: 25, deployer: 10, liquidity: 15, momentum: 25, narrative: 5 },
  bands: [['strong', 80], ['confirm', 65], ['neutral', 45], ['risk', 25], ['avoid', 0]],
  unknownCap: 79,
  exit: { liquidityDropShare: 0.33 },
  outcome: { horizonsHours: [1, 6, 24] },
  tracer: { depth: 4, signatures: 10, top: 2, cacheHours: 24 },
  theme: { minTokens: 3 },
  walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 },
});

export const bandOf = (score) => config.bands.find(([, min]) => score >= min)[0];
