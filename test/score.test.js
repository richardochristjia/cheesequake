import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/db.js';
import { upsertTokens } from '../src/market.js';
import { parsePair } from '../src/sources/dexscreener.js';
import { scoreParts, capScore, runCandidates, runningNow, watchedMints, watchList } from '../src/score.js';

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

test('runCandidates places watched mints first and evaluates full vetoes even when cheap veto fails', async () => {
  const db = openDb(':memory:');
  const watchedMint = addr('W');
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(watchedMint, NOWS - 10);
  assert.deepEqual(watchedMints(db), [watchedMint]);

  let rugCalled = false;
  const dexGet = async (url) => {
    if (url.includes('/tokens/v1/solana/')) return [{
      chainId: 'solana', dexId: 'raydium', pairAddress: addr('P'), baseToken: { address: watchedMint, symbol: 'WTC', name: 'Watched' }, priceUsd: '0.005',
      txns: { h1: { buys: 10, sells: 5 } }, volume: { h1: 1000, h6: 5000, h24: 10000 }, priceChange: { h1: 1 },
      liquidity: { usd: 2000 }, fdv: 50000, marketCap: 50000, pairCreatedAt: (NOWS - 60) * 1000 }];
    return [];
  };
  const rugGet = async () => {
    rugCalled = true;
    return {
      mint: watchedMint, creator: addr('C'), creatorBalance: 0, mintAuthority: 'StillActive', freezeAuthority: null, rugged: true, risks: [], transferFee: {},
      markets: [{ lp: { lpLockedPct: 100, quoteUSD: 1, baseUSD: 1 } }], topHolders: [{ address: 'a', owner: 'o', pct: 8 }], knownAccounts: {}, insiderNetworks: [],
    };
  };
  const deps = { dexGet, geckoGet: async () => ({ data: [] }), rugGet, rpc: { mintInfo: async () => info } };
  await runCandidates({ db, deps, now: () => NOW });

  assert.equal(rugCalled, true);
  const row = db.prepare('SELECT * FROM candidates WHERE mint = ?').get(watchedMint);
  assert.equal(row.listed, 0);
  const vetoes = JSON.parse(row.vetoes);
  assert.ok(vetoes.includes('liquidity'), 'cheap liquidity veto recorded');
  assert.ok(vetoes.includes('age'), 'cheap age veto recorded');
  assert.ok(vetoes.includes('mint_authority'), 'full mint_authority veto recorded');
  assert.ok(vetoes.includes('rugged'), 'full rugged veto recorded');
});

test('watchList classifies safe, caution, and flag coins with plain-English reasons and alerts', () => {
  const db = openDb(':memory:');
  const mSafe = addr('S'), mCaution = addr('C'), mFlag = addr('F'), mUnscanned = addr('U');
  const insW = db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)');
  insW.run(mSafe, 400);
  insW.run(mCaution, 300);
  insW.run(mFlag, 200);
  insW.run(mUnscanned, 100);

  db.prepare('INSERT INTO tokens(mint, symbol, name, creator) VALUES (?,?,?,?)').run(mSafe, 'SAFE', 'Safe Coin', addr('D'));
  db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, symbol, name, price_usd, mcap_usd, liquidity_usd) VALUES (?, 'candidate', ?, ?, 'SAFE', 'Safe Coin', 0.12, 120000, 45000)").run(NOWS - 30, addr('P'), mSafe);
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,72,'confirm',1,'[]','[]','[]',0.12,120000)").run(NOWS - 30, mSafe);

  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,55,'neutral',1,'[]','[]','[\"top10\"]',0.05,50000)").run(NOWS - 30, mCaution);
  db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,'exit_wallet',?,?,'{\"usd\":200}','ew1')").run(NOWS - 100, mCaution, addr('W'));

  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,0,'avoid',0,'[\"mint_authority\"]','[]','[]',0.01,10000)").run(NOWS - 30, mFlag);
  db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,'exit_deployer',?,?,'{\"side\":\"sell\"}','ed1')").run(NOWS - 50, mFlag, addr('D'));
  const insBuy = db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,'buy',?,?,'{\"usd\":10}',?)");
  for (let i = 0; i < 55; i++) insBuy.run(NOWS - 40 + (i % 30), mFlag, addr('W'), `b-${i}`);

  const mExitOnly = addr('E');
  insW.run(mExitOnly, 150);
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,75,'confirm',1,'[]','[]','[]',0.1,100000)").run(NOWS - 30, mExitOnly);
  db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,'exit_deployer',?,?,'{\"side\":\"sell\"}','ed2')").run(NOWS - 50, mExitOnly, addr('D'));
  for (let i = 0; i < 55; i++) insBuy.run(NOWS - 40 + (i % 30), mExitOnly, addr('W'), `be-${i}`);

  const list = watchList(db, NOW);
  assert.deepEqual(list.map((x) => x.mint), [mSafe, mCaution, mFlag, mExitOnly, mUnscanned]);

  const [safeCoin, cautionCoin, flagCoin, exitOnlyCoin, unscannedCoin] = list;
  assert.equal(safeCoin.status, 'safe');
  assert.equal(safeCoin.label, 'Safe to hold');
  assert.equal(safeCoin.pool, addr('P'));
  assert.equal(safeCoin.liquidity_usd, 45000);
  assert.match(safeCoin.reasons.join(' '), /Passed all safety checks/);

  assert.equal(cautionCoin.status, 'caution');
  assert.equal(cautionCoin.label, 'Caution');
  assert.equal(cautionCoin.alerts.length, 1);
  assert.match(cautionCoin.reasons.join(' '), /Tracked wallet sold/);
  assert.match(cautionCoin.reasons.join(' '), /Missing safety or market data/);

  assert.equal(flagCoin.status, 'flag');
  assert.equal(flagCoin.label, 'Red flag');
  assert.equal(flagCoin.alerts.length, 50);
  assert.match(flagCoin.reasons.join(' '), /Mint authority is still active/);
  assert.match(flagCoin.reasons.join(' '), /Creator wallet sold/);

  assert.equal(exitOnlyCoin.status, 'flag');
  assert.equal(exitOnlyCoin.label, 'Red flag');
  assert.equal(exitOnlyCoin.alerts.length, 50);
  assert.match(exitOnlyCoin.reasons.join(' '), /Creator wallet sold/);

  assert.equal(unscannedCoin.status, 'caution');
  assert.match(unscannedCoin.reasons.join(' '), /Waiting for first safety scan/);
});

test('openDb migrates existing tokens table lacking image_url without losing rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-db-mig-'));
  const dbPath = join(dir, 'legacy.db');
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec('CREATE TABLE tokens(mint PRIMARY KEY, symbol, name, description, creator, first_seen)');
    legacy.prepare('INSERT INTO tokens(mint, symbol, name, first_seen) VALUES (?,?,?,?)').run(MINT, 'LEG', 'Legacy', NOWS);
    legacy.close();

    const db = openDb(dbPath);
    const cols = db.prepare('PRAGMA table_info(tokens)').all();
    assert.ok(cols.some((c) => c.name === 'image_url'));
    const row = db.prepare('SELECT mint, symbol, image_url FROM tokens WHERE mint = ?').get(MINT);
    assert.deepEqual({ ...row }, { mint: MINT, symbol: 'LEG', image_url: null });
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePair extracts image_url and upsertTokens preserves non-null image_url', () => {
  assert.equal(
    parsePair({ baseToken: { address: MINT }, info: { imageUrl: 'https://cdn.example/tok.png' } }).image_url,
    'https://cdn.example/tok.png',
  );
  assert.equal(parsePair({ baseToken: { address: MINT } }).image_url, null);

  const db = openDb(':memory:');
  upsertTokens(db, [{ mint: MINT, symbol: 'T', name: 'Tok', image_url: 'https://cdn.example/tok.png' }], NOWS);
  upsertTokens(db, [{ mint: MINT, symbol: 'T', name: 'Tok', image_url: null }], NOWS + 10);
  const row = db.prepare('SELECT image_url FROM tokens WHERE mint = ?').get(MINT);
  assert.equal(row.image_url, 'https://cdn.example/tok.png');
});

test('watchList returns latest vol_h24 and image_url with null defaults', () => {
  const db = openDb(':memory:');
  const mWith = addr('A');
  const mWithout = addr('B');
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(mWith, NOWS);
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(mWithout, NOWS - 10);

  upsertTokens(db, [{ mint: mWith, symbol: 'WTH', name: 'WithImg', image_url: 'https://cdn.example/with.png' }], NOWS);
  db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, price_usd, mcap_usd, liquidity_usd, vol_h24) VALUES (?,'trending',?,?,0.01,100000,20000,1000)").run(NOWS - 120, addr('P'), mWith);
  db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, price_usd, mcap_usd, liquidity_usd, vol_h24) VALUES (?,'trending',?,?,0.02,200000,30000,25000)").run(NOWS - 10, addr('P'), mWith);

  const [withCoin, withoutCoin] = watchList(db, NOW);
  assert.equal(withCoin.vol_h24, 25000);
  assert.equal(withCoin.image_url, 'https://cdn.example/with.png');
  assert.equal(withoutCoin.vol_h24, null);
  assert.equal(withoutCoin.image_url, null);
});
