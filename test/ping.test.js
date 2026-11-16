import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { runWalletCycle, checkExits, deployerWallets } from '../src/ping.js';
import { tx, fakeRpc, addr } from './helpers.js';


async function scenario(times, extra = {}) {
  const db = openDb(':memory:');
  const wallets = times.map((_, i) => addr(String.fromCharCode(65 + i)));
  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `old-${w}`, tx: tx({ wallet: w, mint: addr('O'), blockTime: 1 }) }]]));
  const rpc = fakeRpc(book);
  const run = () => runWalletCycle({ db, rpc, tracked: wallets, solUsd: 100, now: () => 1e12, ...extra });
  await run(); // first cycle backfills silently and sets cursors
  wallets.forEach((w, i) => book[w].push({ signature: `buy-${w}`, tx: tx({ wallet: w, blockTime: times[i] }) }));
  await run();
  return db;
}
const count = (db, kind) => db.prepare('SELECT COUNT(*) c FROM alerts WHERE kind = ?').get(kind).c;

test('first cycle silently backfills tracked wallet up to backfillTxLimit with 0 alerts', async () => {
  const db = openDb(':memory:');
  const w = addr('A');
  const sigs = Array.from({ length: 25 }, (_, i) => ({
    signature: `s${i + 1}`,
    tx: tx({ wallet: w, blockTime: 100 + i }),
  }));
  const rpc = fakeRpc({ [w]: sigs });
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 });
  assert.equal(rpc.calls.tx, 20);
  const trades = db.prepare('SELECT sig FROM trades ORDER BY ts ASC').all().map((r) => r.sig);
  assert.equal(trades.length, 20);
  assert.equal(trades[0], 's6');
  assert.equal(trades[19], 's25');
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w).last_sig, 's25');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);
});

test('first cycle on untracked deployer sets cursor with limit 1 and fetches 0 transactions', async () => {
  const db = openDb(':memory:');
  const d = addr('D');
  let lastLimit = null;
  const baseRpc = fakeRpc({ [d]: [{ signature: 'd1', tx: tx({ wallet: d }) }, { signature: 'd2', tx: tx({ wallet: d }) }] });
  const rpc = {
    ...baseRpc,
    signatures(wallet, opts) {
      lastLimit = opts?.limit;
      return baseRpc.signatures(wallet, opts);
    },
  };
  await runWalletCycle({ db, rpc, tracked: [], deployers: [d], solUsd: 100, now: () => 1e12 });
  assert.equal(lastLimit, 1);
  assert.equal(baseRpc.calls.tx, 0);
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(d).last_sig, 'd2');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 0);
});

test('skips signatures with err != null without calling rpc.transaction and advances cursor', async () => {
  const db = openDb(':memory:');
  const w1 = addr('A');
  const w2 = addr('B');
  const book = {
    [w1]: [
      { signature: 'ok1', tx: tx({ wallet: w1, blockTime: 10 }) },
      { signature: 'err1', err: { InstructionError: [0, 'Custom'] }, tx: tx({ wallet: w1, blockTime: 20 }) },
    ],
    [w2]: [
      { signature: 'only-err-1', err: 'failed', tx: tx({ wallet: w2, blockTime: 10 }) },
      { signature: 'only-err-2', err: 'failed', tx: tx({ wallet: w2, blockTime: 20 }) },
    ],
  };
  const rpc = fakeRpc(book);
  await runWalletCycle({ db, rpc, tracked: [w1, w2], solUsd: 100, now: () => 1e12 });
  assert.equal(rpc.calls.tx, 1);
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w1).last_sig, 'err1');
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w2).last_sig, 'only-err-2');

  // Subsequent live poll also skips failed signatures and advances cursor to newest
  book[w1].push(
    { signature: 'err2', err: 'failed', tx: tx({ wallet: w1, blockTime: 30 }) },
    { signature: 'ok2', tx: tx({ wallet: w1, blockTime: 40 }) },
    { signature: 'err3', err: 'failed', tx: tx({ wallet: w1, blockTime: 50 }) },
  );
  await runWalletCycle({ db, rpc, tracked: [w1, w2], solUsd: 100, now: () => 1e12 });
  assert.equal(rpc.calls.tx, 2);
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w1).last_sig, 'err3');
  assert.equal(count(db, 'buy'), 1);
});

test('subsequent cycles after initial backfill record new trades and fire buy, sell, and consensus alerts', async () => {
  const db = openDb(':memory:');
  const wallets = ['A', 'B', 'C'].map(addr);
  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `init-${w}`, tx: tx({ wallet: w, mint: addr('O'), blockTime: 100 }) }]]));
  const rpc = fakeRpc(book);
  const run = () => runWalletCycle({ db, rpc, tracked: wallets, solUsd: 100, now: () => 1e12 });

  await run();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 3);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);

  wallets.forEach((w, i) => book[w].push({ signature: `buy-${w}`, tx: tx({ wallet: w, mint: addr('M'), blockTime: 1000 + i * 60 }) }));
  book[wallets[0]].push({ signature: `sell-${wallets[0]}`, tx: tx({ wallet: wallets[0], mint: addr('M'), token: -100, sol: 1, blockTime: 1300 }) });
  await run();

  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 7);
  assert.equal(count(db, 'buy'), 3);
  assert.equal(count(db, 'sell'), 1);
  assert.equal(count(db, 'consensus'), 1);
});

test('first cycle silently backfills tracked wallet sell on a listed candidate without firing exit alerts', async () => {
  const db = openDb(':memory:');
  const mint = addr('M'), dep = addr('D'), trk = addr('T');
  const now = 1_000_000 * 1000;
  db.prepare('INSERT INTO tokens(mint, creator) VALUES (?,?)').run(mint, dep);
  db.prepare('INSERT INTO candidates(ts, mint, score, band, listed) VALUES (?,?,?,?,1)').run(now / 1000 - 600, mint, 70, 'confirm');
  const rpc = fakeRpc({
    [dep]: [{ signature: 'hist-dep-sell', tx: tx({ wallet: dep, mint, token: -100, sol: 1, blockTime: now / 1000 - 300 }) }],
    [trk]: [{ signature: 'hist-trk-sell', tx: tx({ wallet: trk, mint, token: -100, sol: 1, blockTime: now / 1000 - 200 }) }],
  });
  await runWalletCycle({ db, rpc, tracked: [dep, trk], solUsd: 100, now: () => now });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);
});

test('transient null transaction during initial backfill retries on next cycle with 0 alerts', async () => {
  const db = openDb(':memory:');
  const w = addr('A');
  const book = {
    [w]: [
      { signature: 's1', tx: tx({ wallet: w, blockTime: 100 }) },
      { signature: 's2', tx: tx({ wallet: w, blockTime: 200 }) },
      { signature: 's3', tx: tx({ wallet: w, blockTime: 300 }) },
    ],
  };
  const baseRpc = fakeRpc(book);
  let blockS2 = true;
  const rpc = {
    ...baseRpc,
    async transaction(sig) {
      if (sig === 's2' && blockS2) return null;
      return baseRpc.transaction(sig);
    },
  };
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 });
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);

  blockS2 = false;
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trades').get().c, 3);
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor WHERE address = ?').get(w).last_sig, 's3');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM alerts').get().c, 0);
});

test('three wallets in 40 minutes, then a fourth: one consensus alert', async () => {
  const db = await scenario([1000, 1000 + 1200, 1000 + 2400, 1000 + 2500]);
  assert.equal(count(db, 'buy'), 4);
  assert.equal(count(db, 'consensus'), 1);
});

test('three wallets hours apart or only two: no consensus', async () => {
  assert.equal(count(await scenario([1000, 1000 + 3 * 3600, 1000 + 6 * 3600]), 'consensus'), 0);
  assert.equal(count(await scenario([1000, 1100]), 'consensus'), 0);
});

test('a sniper buy does not count toward consensus', async () => {
  const db = openDb(':memory:');
  const wallets = ['A', 'B', 'C'].map(addr);
  const ins = db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?)');
  ['x', 'y', 'z'].forEach((m, i) => { // wallet A flips three coins within a minute
    ins.run(`s${i}`, wallets[0], addr(m), 'buy', 1, 10, 100);
    ins.run(`t${i}`, wallets[0], addr(m), 'sell', 1, 12, 160);
  });
  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `old-${w}`, tx: tx({ wallet: w, blockTime: 1 }) }]]));
  const rpc = fakeRpc(book);
  const run = () => runWalletCycle({ db, rpc, tracked: wallets, solUsd: 100, now: () => 1e12 });
  await run();
  wallets.forEach((w, i) => book[w].push({ signature: `buy-${w}`, tx: tx({ wallet: w, blockTime: 1000 + i * 60 }) }));
  await run();
  assert.equal(count(db, 'buy'), 3);
  assert.equal(count(db, 'consensus'), 0);
});

test('exit alerts: tracked sell, deployer sell, liquidity drop; deduped', () => {
  const db = openDb(':memory:');
  const mint = addr('M'), dep = addr('D'), trk = addr('T');
  const now = 1_000_000 * 1000;
  db.prepare('INSERT INTO tokens(mint, creator) VALUES (?,?)').run(mint, dep);
  db.prepare('INSERT INTO candidates(ts, mint, score, band, listed) VALUES (?,?,?,?,1)').run(now / 1000 - 600, mint, 70, 'confirm');
  const tr = db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?)');
  tr.run('s1', trk, mint, 'sell', 1, 50, now / 1000 - 300);
  tr.run('s2', dep, mint, 'sell', 1, 50, now / 1000 - 200);
  const snap = db.prepare('INSERT INTO pool_snapshots(ts, source, mint, liquidity_usd) VALUES (?,?,?,?)');
  snap.run(now / 1000 - 3600, 'candidate', mint, 100000);
  snap.run(now / 1000 - 100, 'candidate', mint, 60000);
  checkExits({ db, tracked: [trk], now });
  checkExits({ db, tracked: [trk], now });
  for (const k of ['exit_wallet', 'exit_deployer', 'exit_liquidity']) assert.equal(count(db, k), 1, k);
});

test('buys polled newest first still give exactly one consensus alert', async () => {
  assert.equal(count(await scenario([300, 200, 100]), 'consensus'), 1);
});

test('buys 100 minutes apart around a middle buy are not one consensus', async () => {
  assert.equal(count(await scenario([1000, 1000 + 3000, 1000 + 6000]), 'consensus'), 0);
});

test('deployerWallets and checkExits monitor watched coins even when unlisted or older than 24h', () => {
  const db = openDb(':memory:');
  const mint = addr('W'), dep = addr('D'), trk = addr('T');
  const now = 1_000_000 * 1000;
  const nowS = now / 1000;
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(mint, nowS - 200_000);
  db.prepare('INSERT INTO tokens(mint, creator) VALUES (?,?)').run(mint, dep);
  db.prepare('INSERT INTO candidates(ts, mint, score, band, listed) VALUES (?,?,?,?,0)').run(nowS - 200_000, mint, 0, 'avoid');

  assert.deepEqual(deployerWallets(db, now), [dep]);

  const tr = db.prepare('INSERT INTO trades VALUES (?,?,?,?,?,?,?)');
  tr.run('w1', trk, mint, 'sell', 1, 75, nowS - 300);
  tr.run('w2', dep, mint, 'out', 1, 0, nowS - 200);
  const snap = db.prepare('INSERT INTO pool_snapshots(ts, source, mint, liquidity_usd, vol_h1, buyers_h1) VALUES (?,?,?,?,?,?)');
  snap.run(nowS - 3600, 'candidate', mint, 100000, 10000, 50);
  snap.run(nowS - 100, 'candidate', mint, 50000, 20000, 20);

  checkExits({ db, tracked: [trk], now });
  for (const k of ['exit_wallet', 'exit_deployer', 'exit_liquidity', 'exit_divergence']) {
    assert.equal(count(db, k), 1, k);
  }
});
