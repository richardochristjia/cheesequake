import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/db.js';
import { upsertTokens } from '../src/market.js';
import { parsePair } from '../src/sources/dexscreener.js';
import { config } from '../src/config.js';
import { checkExits } from '../src/ping.js';
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

  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,?,?,1,'[]','[]','[]',0.02,200000)").run(NOWS, mWith, 82, 'strong');
  const [runCoin] = runningNow(db, NOW);
  assert.equal(runCoin.image_url, 'https://cdn.example/with.png');
  assert.equal(runCoin.watched, true);
});

test('scoreParts momentum price-change half is a hump peaking at +25%', () => {
  // vol_h1 null leaves the price-change half as the whole momentum value
  const mo = (chg_h1) => scoreParts({ market: market({ vol_h1: null, chg_h1 }), report: report() }).reasons.find((r) => r.part === 'momentum').points;
  assert.deepEqual([0, 25, 50, 100].map(mo), [0, 31, 15.5, 0]);
  assert.ok(mo(25) > mo(0) && mo(25) > mo(100));
  assert.equal(mo(-10), 0);
});

test('scoreParts momentum with null chg_h1 is the volume pace alone', () => {
  const mo = (o) => scoreParts({ market: market(o), report: report() }).reasons.find((r) => r.part === 'momentum').points;
  assert.equal(mo({ chg_h1: null }), mo({ chg_h1: undefined }));
  assert.equal(mo({ chg_h1: null }), Math.round(0.5 * 31 * 10) / 10); // pace 2 -> 0.5
});

// Watch and gem: one coin, price history on one pool.
function priceCoin(prices, { score = 60, pool = addr('P') } = {}) {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(MINT, 1);
  const ins = db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, price_usd, mcap_usd, created_at, buyers_h1, buyers_h6, buys_h1, sells_h1) VALUES (?, 'candidate', ?, ?, ?, 100000, ?, 30, 60, 60, 40)");
  prices.forEach((p, i) => ins.run(NOWS - 60 - (prices.length - 1 - i) * 600, pool, MINT, p, NOWS - 3600));
  const last = prices.at(-1);
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,?,'neutral',1,'[]','[]','[]',?,100000)").run(NOWS - 60, MINT, score, last);
  return db;
}

test('watch: 60% below the 2h peak is caution with a drawdown reason, 40% below is safe', () => {
  const [bad] = watchList(priceCoin([1, 0.4]), NOW);
  assert.equal(bad.status, 'caution');
  assert.ok(bad.reasons.some((r) => r.includes('below its 2h peak') && r.includes('60%')));
  const [ok] = watchList(priceCoin([1, 0.6]), NOW);
  assert.equal(ok.status, 'safe');
});

test('watch: a peak on another pool or outside 2h is ignored, and no history keeps current behaviour', () => {
  const db = priceCoin([0.4]);
  db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, price_usd) VALUES (?, 'candidate', ?, ?, 1)").run(NOWS - 600, addr('X'), MINT);
  db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, price_usd) VALUES (?, 'candidate', ?, ?, 1)").run(NOWS - 60 - 7201, addr('P'), MINT);
  assert.equal(watchList(db, NOW)[0].status, 'safe');
  assert.equal(watchList(priceCoin([1]), NOW)[0].status, 'safe');
});

test('gem: 35% below the 2h peak is false, 10% below is true, no history is true', () => {
  assert.equal(runningNow(priceCoin([1, 0.65]), NOW)[0].gem, false);
  assert.equal(runningNow(priceCoin([1, 0.9]), NOW)[0].gem, true);
  assert.equal(runningNow(priceCoin([1]), NOW)[0].gem, true);
});

test('BUNC replay: watch status and gem badge follow the drop from peak', () => {
  const rows = JSON.parse(readFileSync(new URL('./fixtures/bunc-snapshots.json', import.meta.url)));
  const db = openDb(':memory:');
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(rows[0].mint, 1);
  const ins = db.prepare(`INSERT INTO pool_snapshots(${Object.keys(rows[0]).join(',')}) VALUES (${Object.keys(rows[0]).map(() => '?').join(',')})`);
  const seen = {};
  let prev = null;
  for (const r of rows) {
    ins.run(...Object.values(r));
    if (r.ts === prev) continue;
    prev = r.ts;
    db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,60,'neutral',1,'[]','[]','[]',?,?)").run(r.ts, r.mint, r.price_usd, r.mcap_usd);
    checkExits({ db, tracked: [], now: r.ts * 1000 });
    seen[r.ts] = { status: watchList(db, r.ts * 1000)[0].status, gem: runningNow(db, r.ts * 1000, { ...config, gem: { ...config.gem, maxAgeHours: 1e6 } })[0].gem };
  }
  assert.equal(seen[1795061128].status, 'caution'); // 11:05, -51%
  assert.equal(seen[1795061428].status, 'safe'); // 11:10, -43%
  for (const ts of [1795061728, 1795062028, 1795062628]) assert.equal(seen[ts].status, 'flag', String(ts)); // liquidity alert exists
  assert.equal(seen[1795059928].gem, true); // -14%
  for (const ts of Object.keys(seen).filter((k) => k >= 1795060228)) assert.equal(seen[ts].gem, false, ts);
});

test('runCandidates includes active new pools, prioritizes watched over discovery, and respects minAgeMinutes=5', async () => {
  const db = openDb(':memory:');
  const activeNew = addr('N');
  const inactiveNew = addr('I');
  const youngPass = addr('Y');
  const tooYoung = addr('Z');
  const watchedOld = addr('W');

  const ts = NOWS - 30;
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6, liquidity_usd) VALUES (?,'new',?,25,20,25000)").run(ts, activeNew);
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6, liquidity_usd) VALUES (?,'new',?,2,5,25000)").run(ts, inactiveNew);
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6, liquidity_usd) VALUES (?,'trending',?,20,40,30000)").run(ts, youngPass);
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6, liquidity_usd) VALUES (?,'trending',?,20,40,30000)").run(ts, tooYoung);
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(watchedOld, NOWS - 3600);

  // Fill 57 more new-pool mints so 60-mint cap is hit (1 watched + 2 trending + 1 activeNew + 57 filler = 61, pushing last filler out).
  let lastFiller;
  for (let i = 0; i < 57; i++) {
    lastFiller = `F${String(i).padStart(3, '0')}` + '1'.repeat(36);
    db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6, liquidity_usd) VALUES (?,'new',?,20,40,30000)").run(ts, lastFiller);
  }

  let requestedMints = [];
  const dexGet = async (url) => {
    if (url.includes('/tokens/v1/solana/')) {
      const mints = url.split('/tokens/v1/solana/')[1].split(',');
      requestedMints = requestedMints.concat(mints);
      return mints
        .filter((m) => [activeNew, youngPass, tooYoung].includes(m))
        .map((m) => ({
          chainId: 'solana',
          dexId: 'raydium',
          pairAddress: addr('P'),
          baseToken: { address: m, symbol: 'T', name: 'T' },
          priceUsd: '0.01',
          txns: { h1: { buys: 300, sells: 200 } },
          volume: { h1: 20000, h6: 60000, h24: 90000 },
          priceChange: { h1: 25 },
          liquidity: { usd: 60000 },
          fdv: 500000,
          marketCap: 500000,
          pairCreatedAt: (m === tooYoung ? NOWS - 3 * 60 : NOWS - 6 * 60) * 1000,
        }));
    }
    return [];
  };
  const deps = { dexGet, geckoGet: async () => ({ data: [] }), rugGet: goodRaw(), rpc: { mintInfo: async () => info } };
  await runCandidates({ db, deps, now: () => NOW });

  assert.ok(requestedMints.includes(activeNew), 'active new pool included');
  assert.ok(!requestedMints.includes(inactiveNew), 'inactive new pool excluded');
  assert.ok(requestedMints.includes(watchedOld), 'watched prioritized ahead of discovery in 60-mint cap');
  assert.ok(!requestedMints.includes(lastFiller), 'excess discovery mint pushed out by 60-mint cap');

  const running = runningNow(db, NOW);
  const runningMints = running.map((r) => r.mint);
  assert.ok(runningMints.includes(activeNew), '6m old active new pool passes minAgeMinutes=5');
  assert.ok(runningMints.includes(youngPass), '6m old trending pool passes minAgeMinutes=5');
  assert.ok(!runningMints.includes(tooYoung), '3m old pool vetoed by minAgeMinutes=5');
  assert.equal(running.find((r) => r.mint === activeNew).watched, false);
});

test('walletFacts decays tracked-wallet buy weight by recency over 24h', async () => {
  const wallet = addr('K');
  const makeRun = async (buyAgeSeconds) => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, 150, 400)").run(NOWS - 60, MINT);
    db.prepare('INSERT INTO trades(wallet, mint, side, token_amount, quote_usd, ts, sig) VALUES (?,?,?,?,?,?,?)')
      .run(wallet, MINT, 'buy', 1000, 100, NOWS - buyAgeSeconds, 'sig1');
    const m = market();
    const dexGet = async (url) => (url.includes('/tokens/v1/solana/') ? [{
      chainId: 'solana', dexId: 'raydium', pairAddress: m.pool, baseToken: { address: MINT, symbol: 'T', name: 'T' }, priceUsd: '0.01',
      txns: { h1: { buys: 300, sells: 200 } }, volume: { h1: 20000, h6: 60000, h24: 90000 }, priceChange: { h1: 1 },
      liquidity: { usd: 60000 }, fdv: 500000, marketCap: 500000, pairCreatedAt: (NOWS - 6 * 3600) * 1000,
    }] : []);
    const deps = { dexGet, geckoGet: async () => ({ data: [] }), rugGet: goodRaw(), rpc: { mintInfo: async () => info } };
    await runCandidates({ db, deps, tracked: [wallet], now: () => NOW });
    return runningNow(db, NOW)[0].reasons.find((r) => r.part === 'wallets').points;
  };

  const recentPts = await makeRun(3600);
  const stalePts = await makeRun(23 * 3600);
  assert.ok(recentPts > stalePts, `expected recent wallet points (${recentPts}) > stale (${stalePts})`);
});

// --- universe, activity gate, GeckoTerminal fill ---
const pair = (mint, o = {}) => ({
  chainId: 'solana', dexId: 'raydium', pairAddress: addr('P'), baseToken: { address: mint, symbol: 'T', name: 'T' }, priceUsd: '0.01',
  txns: { h1: { buys: 300, sells: 200 } }, volume: { h1: 20000, h6: 60000, h24: 90000 }, priceChange: { h1: 1 },
  liquidity: { usd: 60000 }, fdv: 500000, marketCap: 500000, pairCreatedAt: (NOWS - 6 * 3600) * 1000, ...o,
});
const mk = (prefix, n) => Array.from({ length: n }, (_, i) => {
  const mint = `${prefix}${String(i).padStart(3, '0')}` + '1'.repeat(36);
  return mint;
});
const trade = (db, wallet, mint, side, ts, sig) =>
  db.prepare('INSERT INTO trades(wallet, mint, side, token_amount, quote_usd, ts, sig) VALUES (?,?,?,?,?,?,?)').run(wallet, mint, side, 1000, 100, ts, sig);
function universeDeps(db, { pairOf = (m) => pair(m), geckoGet = async () => ({ data: [] }) } = {}) {
  const requested = [];
  const dexGet = async (url) => {
    if (!url.includes('/tokens/v1/solana/')) return [];
    const mints = url.split('/tokens/v1/solana/')[1].split(',');
    requested.push(...mints);
    return mints.map((m) => pairOf(m));
  };
  return { requested, deps: { dexGet, geckoGet, rugGet: goodRaw(), rpc: { mintInfo: async () => info } } };
}

test('universe scores every trending mint and skips mints bought only by weight-0 wallets', async () => {
  const db = openDb(':memory:');
  const sniper = addr('S');
  const sniperMints = mk('S', 80);
  const trending = mk('T', 20);
  // sniper: buy then sell within 60s on 3+ mints, so its weight is 0
  sniperMints.forEach((m, i) => { trade(db, sniper, m, 'buy', NOWS - 1000 - i, `b${i}`); trade(db, sniper, m, 'sell', NOWS - 960 - i, `s${i}`); });
  for (const m of trending) db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, 150, 400)").run(NOWS - 60, m);
  const { requested, deps } = universeDeps(db);
  await runCandidates({ db, deps, tracked: [sniper], now: () => NOW });
  for (const m of trending) assert.ok(requested.includes(m), 'trending mint requested');
  assert.ok(!sniperMints.some((m) => requested.includes(m)), 'sniper-only mints never enter the universe');
});

test('universe ranks wallet mints by weighted buying wallets', async () => {
  const db = openDb(':memory:');
  const [w1, w2] = [addr('A'), addr('B')];
  const many = addr('X');
  const few = addr('Y');
  trade(db, w1, many, 'buy', NOWS - 100, 'a1'); trade(db, w2, many, 'buy', NOWS - 200, 'a2');
  trade(db, w1, few, 'buy', NOWS - 50, 'a3'); // newer, but one wallet
  const fillers = mk('F', 59);
  for (const m of fillers) db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, 150, 400)").run(NOWS - 60, m);
  const { requested, deps } = universeDeps(db);
  await runCandidates({ db, deps, tracked: [w1, w2], now: () => NOW });
  assert.equal(requested.length, 60);
  assert.ok(requested.includes(many), 'two-wallet mint takes the last slot');
  assert.ok(!requested.includes(few), 'one-wallet mint is cut');
});

test('a dead watched coin is still listed, a dead non-watched coin is vetoed inactive', async () => {
  const db = openDb(':memory:');
  const watchedDead = addr('W');
  const dead = addr('D');
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(watchedDead, NOWS - 10);
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, 2, 5)").run(NOWS - 60, dead);
  const { deps } = universeDeps(db, { pairOf: (m) => pair(m, { txns: { h1: { buys: 0, sells: 0 } }, liquidity: undefined }) });
  await runCandidates({ db, deps, now: () => NOW });
  const w = db.prepare('SELECT * FROM candidates WHERE mint = ?').get(watchedDead);
  assert.equal(w.listed, 1);
  assert.ok(!w.unknowns.includes('inactive'));
  const d = db.prepare('SELECT * FROM candidates WHERE mint = ?').get(dead);
  assert.equal(d.listed, 0);
  assert.match(d.vetoes, /inactive/);
});

test('null DexScreener liquidity, volume and change are filled from GeckoTerminal pools/multi', async () => {
  const db = openDb(':memory:');
  const pool = addr('P');
  const geckoGet = async (url) => (url.includes('/pools/multi/') ? { data: [{
    id: 'solana_' + pool,
    attributes: { address: pool, name: 'T / SOL', reserve_in_usd: '45000', volume_usd: { h1: '700', h6: '2100' }, price_change_percentage: { h1: '12' },
      transactions: { h1: { buys: 30, sells: 10, buyers: 25 }, h6: { buyers: 90 } } },
    relationships: { base_token: { data: { id: 'solana_' + MINT } } },
  }] } : { data: [] });
  const { deps } = universeDeps(db, { geckoGet, pairOf: (m) => pair(m, { liquidity: undefined, volume: undefined, priceChange: undefined, pairAddress: pool }) });
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(MINT, NOWS - 10);
  await runCandidates({ db, deps, now: () => NOW });
  const s = db.prepare("SELECT liquidity_usd, vol_h1, vol_h6, chg_h1, buyers_h1 FROM pool_snapshots WHERE source = 'candidate' AND mint = ?").get(MINT);
  assert.deepEqual({ ...s }, { liquidity_usd: 45000, vol_h1: 700, vol_h6: 2100, chg_h1: 12, buyers_h1: 25 });
});

test('rescaled weights: perfect base parts score 100, wallet bonus stays capped, unknowns cap at 79', () => {
  const perfect = {
    market: market({ buys_h1: 700, sells_h1: 300, chg_h1: 25, vol_h1: 30000 }),
    report: report({ topHolders: [] }),
    theme: { keyword: 'k', share: 0.2, prevShare: 0.1 },
  };
  assert.equal(scoreParts(perfect).score, 100);
  assert.equal(scoreParts({ ...perfect, q: 5, consensus: true }).score, 100);
  const s = scoreParts({ ...perfect, report: null });
  assert.ok(s.unknowns.length);
  assert.equal(capScore(100, s.unknowns), 79);
});

test('missing DexScreener image is filled from GeckoTerminal tokens/multi, cheap-vetoed mints are not requested', async () => {
  const db = openDb(':memory:');
  const dead = addr('D');
  for (const [m, b] of [[MINT, 150], [dead, 2]]) db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, ?, 400)").run(NOWS - 60, m, b);
  const asked = [];
  const geckoGet = async (url) => {
    if (!url.includes('/tokens/multi/')) return { data: [] };
    asked.push(url);
    return { data: [{ id: 'solana_' + MINT, attributes: { address: MINT, image_url: 'https://img.example/m.png' } }] };
  };
  const { deps } = universeDeps(db, { geckoGet });
  await runCandidates({ db, deps, now: () => NOW });
  assert.equal(asked.length, 1);
  assert.ok(asked[0].includes(MINT) && !asked[0].includes(dead));
  assert.equal(runningNow(db, NOW).find((r) => r.mint === MINT).image_url, 'https://img.example/m.png');
});

const trendRow = (db, m, b) => db.prepare("INSERT INTO pool_snapshots(ts, source, mint, buyers_h1, buyers_h6) VALUES (?, 'trending', ?, ?, 400)").run(NOWS - 60, m, b);

test('a DexScreener image is kept and tokens/multi is not asked for it', async () => {
  const db = openDb(':memory:');
  trendRow(db, MINT, 150);
  const asked = [];
  const geckoGet = async (url) => {
    if (!url.includes('/tokens/multi/')) return { data: [] };
    asked.push(url);
    return { data: [{ id: 'solana_' + MINT, attributes: { address: MINT, image_url: 'https://gecko.example/x.png' } }] };
  };
  const { deps } = universeDeps(db, { geckoGet, pairOf: (m) => pair(m, { info: { imageUrl: 'https://dex.example/i.png' } }) });
  await runCandidates({ db, deps, now: () => NOW });
  assert.equal(asked.length, 0);
  assert.equal(runningNow(db, NOW)[0].image_url, 'https://dex.example/i.png');
});

test('a stored image is not re-requested from tokens/multi', async () => {
  const db = openDb(':memory:');
  trendRow(db, MINT, 150);
  db.prepare('INSERT INTO tokens(mint, symbol, name, first_seen, image_url) VALUES (?,?,?,?,?)').run(MINT, 'T', 'T', NOWS - 999, 'https://old.example/i.png');
  const asked = [];
  const geckoGet = async (url) => { if (url.includes('/tokens/multi/')) asked.push(url); return { data: [] }; };
  const { deps } = universeDeps(db, { geckoGet });
  await runCandidates({ db, deps, now: () => NOW });
  assert.equal(asked.length, 0);
});

test('pools/multi fills null DexScreener liquidity even when buyers are already known', async () => {
  const db = openDb(':memory:');
  trendRow(db, MINT, 150);
  const pool = addr('P');
  const geckoGet = async (url) => (url.includes('/pools/multi/') ? { data: [{
    id: 'solana_' + pool,
    attributes: { address: pool, reserve_in_usd: '45000', volume_usd: { h1: '700', h6: '2100' }, price_change_percentage: { h1: '12' },
      transactions: { h1: { buys: 30, sells: 10, buyers: 25 }, h6: { buyers: 90 } } },
    relationships: { base_token: { data: { id: 'solana_' + MINT } } },
  }] } : { data: [] });
  const { deps } = universeDeps(db, { geckoGet, pairOf: (m) => pair(m, { liquidity: undefined, pairAddress: pool }) });
  await runCandidates({ db, deps, now: () => NOW });
  const s = db.prepare("SELECT liquidity_usd, buyers_h1 FROM pool_snapshots WHERE source = 'candidate' AND mint = ?").get(MINT);
  assert.deepEqual({ ...s }, { liquidity_usd: 45000, buyers_h1: 150 });
});

// Seeds one listed candidate plus its 'candidate' snapshot rows; `snap: null` seeds no snapshot.
function gemRow(over = {}, db = openDb(':memory:')) {
  const { mcap = 100000, snap = {} } = over;
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, mcap_usd) VALUES (?,?,70,'confirm',1,'[]','[]','[]',?)").run(NOWS - 60, MINT, mcap);
  if (snap) {
    const s = { created_at: NOWS - 3600, buyers_h1: 30, buyers_h6: 60, buys_h1: 60, sells_h1: 40, ...snap };
    db.prepare("INSERT INTO pool_snapshots(ts, source, mint, created_at, buyers_h1, buyers_h6, buys_h1, sells_h1) VALUES (?, 'candidate', ?, ?, ?, ?, ?, ?)")
      .run(NOWS - 60, MINT, s.created_at, s.buyers_h1, s.buyers_h6, s.buys_h1, s.sells_h1);
  }
  return db;
}
const isGem = (db) => runningNow(db, NOW)[0].gem;

test('gem: true when every rule holds, and the raw snapshot columns stay out of the row', () => {
  const db = gemRow();
  const [r] = runningNow(db, NOW);
  assert.equal(r.gem, true);
  assert.ok(!('buyers_h1' in r) && !('created_at' in r));
});

test('gem: each rule failing alone gives false', () => {
  assert.equal(isGem(gemRow({ mcap: 19999 })), false);
  assert.equal(isGem(gemRow({ mcap: 500001 })), false);
  assert.equal(isGem(gemRow({ mcap: null })), false);
  assert.equal(isGem(gemRow({ snap: { created_at: NOWS - 30 * 3600 } })), false);
  assert.equal(isGem(gemRow({ snap: { buyers_h1: 9, buyers_h6: 6 } })), false);
  assert.equal(isGem(gemRow({ snap: { buyers_h1: 10, buyers_h6: 60 } })), false); // surge 1
  assert.equal(isGem(gemRow({ snap: { buys_h1: 50, sells_h1: 50 } })), false); // share 0.5
});

test('gem: null or zero inputs are false, not NaN or a throw', () => {
  assert.equal(isGem(gemRow({ snap: { buyers_h6: null } })), false);
  assert.equal(isGem(gemRow({ snap: { buyers_h6: 0 } })), false);
  assert.equal(isGem(gemRow({ snap: { buys_h1: 0, sells_h1: 0 } })), false);
  assert.equal(isGem(gemRow({ snap: { buys_h1: null } })), false);
  assert.equal(isGem(gemRow({ snap: { created_at: null } })), false);
  assert.equal(isGem(gemRow({ snap: null })), false);
});

test('gem: bounds are inclusive on mcap, buyers, surge and share, and age is strict', () => {
  assert.equal(isGem(gemRow({ mcap: 20000 })), true);
  assert.equal(isGem(gemRow({ mcap: 500000 })), true);
  assert.equal(isGem(gemRow({ snap: { buyers_h1: 10, buyers_h6: 30, buys_h1: 55, sells_h1: 45 } })), true); // surge 2, share 0.55
  assert.equal(isGem(gemRow({ snap: { created_at: NOWS - 24 * 3600 } })), false);
  assert.equal(isGem(gemRow({ snap: { created_at: NOWS - 24 * 3600 + 1 } })), true);
});

test('gem: duplicate candidate snapshot rows give one running row, judged by the latest', () => {
  const db = gemRow({ snap: { buyers_h1: 3, buyers_h6: 60 } });
  db.prepare("INSERT INTO pool_snapshots(ts, source, mint, created_at, buyers_h1, buyers_h6, buys_h1, sells_h1) VALUES (?, 'candidate', ?, ?, 30, 60, 60, 40)").run(NOWS - 60, MINT, NOWS - 3600);
  const rows = runningNow(db, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gem, true);
});
