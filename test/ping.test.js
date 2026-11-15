import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { runWalletCycle } from '../src/ping.js';
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
