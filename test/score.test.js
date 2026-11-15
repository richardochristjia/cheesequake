import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { scoreParts, capScore, runCandidates, runningNow } from '../src/score.js';

const addr = (c) => c.repeat(4) + '1'.repeat(36);
const NOW = 2_000_000_000_000;
const NOWS = NOW / 1000;
const MINT = addr('M');

const market = (o = {}) => ({
  mint: MINT, pool: addr('P'), dex: 'raydium', created_at: NOWS - 6 * 3600, price_usd: 0.01, mcap_usd: 500000, liquidity_usd: 60000,
  vol_h1: 20000, vol_h6: 60000, buys_h1: 300, sells_h1: 200, buyers_h1: 150, buyers_h6: 400, symbol: 'T', name: 'T', ...o,
});
const report = (o = {}) => ({
  creator: addr('C'), creatorBalance: 5, mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], transferFeePct: 0,
  lpLockedPct: 100, topHolders: [{ address: 'a', owner: 'o', pct: 8 }], knownAccounts: [], insiderNetworks: 0, insiderHolding: 0, supply: null, ...o,
});

test('consensus coin scores higher than the same coin without', () => {
  const a = scoreParts({ market: market(), report: report(), consensus: true });
  const b = scoreParts({ market: market(), report: report(), consensus: false });
  assert.ok(a.score > b.score);
  assert.equal(a.unknowns.length, 0);
});

test('unknowns cap the score at 79', () => {
  const s = scoreParts({ market: market(), report: null, consensus: true, q: 5 });
  assert.ok(s.unknowns.includes('health'));
  assert.ok(capScore(100, s.unknowns) <= 79);
});

// --- pipeline with fakes ---
function setup({ rug, mintInfo }) {
  const db = openDb(':memory:');
  const ts = NOWS - 60;
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, 150, 400)").run(ts, MINT);
  const m = market();
  const dexGet = async (url) => {
    if (url.includes('/tokens/v1/solana/')) return [{
      chainId: 'solana', dexId: 'raydium', pairAddress: m.pool, baseToken: { address: MINT, symbol: 'T', name: 'T' }, priceUsd: '0.01',
      txns: { h1: { buys: 300, sells: 200 } }, volume: { h1: 20000, h6: 60000, h24: 90000 }, priceChange: { h1: 1 },
      liquidity: { usd: 60000 }, fdv: 500000, marketCap: 500000, pairCreatedAt: (NOWS - 6 * 3600) * 1000 }];
    return [];
  };
  const deps = { dexGet, geckoGet: async () => ({ data: [] }), rugGet: rug, rpc: { mintInfo: async () => mintInfo } };
  return { db, deps };
}
const goodRaw = (o = {}) => async () => ({
  mint: MINT, creator: addr('C'), creatorBalance: 5, mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], transferFee: {},
  markets: [{ lp: { lpLockedPct: 100, quoteUSD: 1, baseUSD: 1 } }], topHolders: [{ address: 'a', owner: 'o', pct: 8 }], knownAccounts: {}, insiderNetworks: [], ...o,
});
const info = { decimals: 6, supply: 1e9, mintAuthority: null, freezeAuthority: null };

test('a veto beats a consensus score: not listed, not running', async () => {
  const { db, deps } = setup({ rug: goodRaw({ mintAuthority: 'ActiveKey' }), mintInfo: info });
  db.prepare("INSERT INTO alerts(ts, kind, mint, detail, dedupe) VALUES (?, 'consensus', ?, '{}', 'c')").run(NOWS - 100, MINT);
  await runCandidates({ db, deps, now: () => NOW });
  const row = db.prepare('SELECT * FROM candidates').get();
  assert.equal(row.listed, 0);
  assert.match(row.vetoes, /mint_authority/);
  assert.equal(runningNow(db, NOW).length, 0);
});

test('a clean coin is listed and scheduled for outcomes', async () => {
  const { db, deps } = setup({ rug: goodRaw(), mintInfo: info });
  await runCandidates({ db, deps, now: () => NOW });
  assert.equal(runningNow(db, NOW).length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM outcomes').get().c, 3);
});

test('RugCheck outage: unknowns listed, score at most 79, no crash', async () => {
  const down = async () => { throw Object.assign(new Error('down'), { code: 'SOURCE_UNAVAILABLE' }); };
  const { db, deps } = setup({ rug: down, mintInfo: info });
  db.prepare("INSERT INTO alerts(ts, kind, mint, detail, dedupe) VALUES (?, 'consensus', ?, '{}', 'c')").run(NOWS - 100, MINT);
  await runCandidates({ db, deps, now: () => NOW });
  const [r] = runningNow(db, NOW);
  assert.ok(r.unknowns.includes('top10'));
  assert.ok(r.score <= 79);
});

test('boost and profile descriptions are stored on the token', async () => {
  const { db, deps } = setup({ rug: goodRaw(), mintInfo: info });
  const base = deps.dexGet;
  deps.dexGet = async (url) => url.includes('token-boosts') ? [{ chainId: 'solana', tokenAddress: MINT, description: 'frog on a log' }] : base(url);
  await runCandidates({ db, deps, now: () => NOW });
  assert.equal(db.prepare('SELECT description FROM tokens WHERE mint = ?').get(MINT).description, 'frog on a log');
});

test('a newer vetoed row hides an earlier listed row from Running now', () => {
  const db = openDb(':memory:');
  const ins = db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns) VALUES (?,?,?,?,?,?,'[]','[]')");
  ins.run(NOWS - 120, MINT, 70, 'good', 1, '[]');
  ins.run(NOWS - 60, MINT, 0, 'avoid', 0, '["mint_authority"]');
  assert.deepEqual(runningNow(db, NOW), []);
});
