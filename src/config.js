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
    maxInsiderPct: 20, washMinBuyers: 10, washVolumeUsd: 50000, minBuyersH1: 10,
  },
  universe: { cap: 60, newPools: 15, wallets: 15 }, // slots per source in the candidate universe
  gem: { minMcapUsd: 20000, maxMcapUsd: 500000, maxAgeHours: 24, minBuyersH1: 10, minSurge: 2, minBuyShare: 0.55, maxDrawdownShare: 0.3 }, // early-gem badge
  momentum: { chgPeakPct: 25, chgZeroPct: 75 }, // 1h price-change credit peaks at chgPeakPct, is gone by chgZeroPct
  drawdown: { windowMinutes: 120, cautionShare: 0.5 },
  consensus: { wallets: 3, windowMinutes: 60 },
  scorecard: { sniperHoldSeconds: 300, minHolds: 3, ratedTrades: 10 },
  weights: { wallets: 20, health: 31, deployer: 13, liquidity: 19, momentum: 31, narrative: 6 }, // non-wallet parts sum to 100; wallets is a bonus
  bands: [['strong', 80], ['confirm', 65], ['neutral', 45], ['risk', 25], ['avoid', 0]],
  unknownCap: 79,
  exit: { liquidityDropShare: 0.33 },
  outcome: { horizonsHours: [1, 6, 24] },
  tracer: { depth: 4, signatures: 10, top: 2, cacheHours: 24 },
  theme: { minTokens: 3, mergeOverlap: 0.66, cloneShare: 0.5, oneCoinShare: 0.85, newHours: 6 },
  walletPoll: { sigLimit: 100, txLimit: 20, backfillTxLimit: 20 },
});

export const bandOf = (score) => config.bands.find(([, min]) => score >= min)[0];
