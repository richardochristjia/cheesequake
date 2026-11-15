import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { runWalletCycle, checkExits } from '../src/ping.js';
import { tx, fakeRpc, addr } from './helpers.js';


async function scenario(times, extra = {}) {
  const db = openDb(':memory:');
  const wallets = times.map((_, i) => addr(String.fromCharCode(65 + i)));
  const book = Object.fromEntries(wallets.map((w) => [w, [{ signature: `old-${w}`, tx: tx({ wallet: w, blockTime: 1 }) }]]));
  const rpc = fakeRpc(book);
  const run = () => runWalletCycle({ db, rpc, tracked: wallets, solUsd: 100, now: () => 1e12, ...extra });
  await run(); // first cycle sets cursors
  wallets.forEach((w, i) => book[w].push({ signature: `buy-${w}`, tx: tx({ wallet: w, blockTime: times[i] }) }));
  await run();
  return db;
}
const count = (db, kind) => db.prepare('SELECT COUNT(*) c FROM alerts WHERE kind = ?').get(kind).c;

test('first cycle sets cursor and fetches no transactions', async () => {
  const db = openDb(':memory:');
  const w = addr('A');
  const rpc = fakeRpc({ [w]: [{ signature: 's1', tx: tx({ wallet: w }) }] });
  await runWalletCycle({ db, rpc, tracked: [w], solUsd: 100, now: () => 1e12 });
  assert.equal(rpc.calls.tx, 0);
  assert.equal(db.prepare('SELECT last_sig FROM wallet_cursor').get().last_sig, 's1');
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
