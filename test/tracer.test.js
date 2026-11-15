import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrace, startTrace, getTrace } from '../src/tracer.js';
import { openDb } from '../src/db.js';
import { addr } from './helpers.js';

// One outgoing transfer per edge: from loses `sol`, to gains it.
function graph(edges) {
  const book = {};
  edges.forEach(([from, to, sol], i) => {
    const tx = {
      meta: { err: null, fee: 0, preBalances: [10e9, 0], postBalances: [10e9 - sol * 1e9, sol * 1e9], preTokenBalances: [], postTokenBalances: [] },
      transaction: { message: { accountKeys: [{ pubkey: from }, { pubkey: to }] } },
    };
    (book[from] ??= []).push({ signature: `s${i}`, tx });
  });
  return {
    signatures: async (w) => (book[w] ?? []).map((s) => ({ signature: s.signature })),
    transaction: async (sig) => Object.values(book).flat().find((s) => s.signature === sig)?.tx ?? null,
  };
}
const W = [0, 1, 2, 3, 4, 5, 6].map((i) => addr(String.fromCharCode(65 + i)));
const X = addr('X'), L = addr('L'), Z = addr('Z');

test('stops at depth 4; labelled node is recorded but not expanded', async () => {
  const rpc = graph([
    [W[0], W[1], 5], [W[1], W[2], 5], [W[2], W[3], 5], [W[3], W[4], 5], [W[4], W[5], 5], [W[5], W[6], 5],
    [W[0], X, 2], [X, L, 2], [L, Z, 2],
  ]);
  const labels = new Map([[L, { address: L, name: 'Some exchange', type: 'exchange' }]]);
  const r = await runTrace({ rpc, start: W[0], labels, solUsd: 100 });
  const by = Object.fromEntries(r.nodes.map((n) => [n.address, n]));
  assert.equal(by[W[4]].depth, 4);
  assert.equal(by[W[5]], undefined);
  assert.equal(by[L].depth, 2);
  assert.equal(by[L].type, 'exchange');
  assert.equal(by[Z], undefined);
  assert.equal(r.status, 'done');
  assert.ok(r.edges.find((e) => e.from === W[0] && e.to === W[1]).usd === 500);
});

test('source failure gives a partial result; result is cached', async () => {
  const db = openDb(':memory:');
  const rpc = { signatures: async () => { throw new Error('rate limited'); }, transaction: async () => null };
  const first = startTrace({ db, rpc, labels: new Map(), solUsd: 100, now: () => 1e12, start: W[0] });
  assert.equal(first.status, 'running');
  await first.run;
  assert.equal(getTrace(db, W[0]).status, 'partial');
  assert.equal(startTrace({ db, rpc, labels: new Map(), solUsd: 100, now: () => 1e12 + 1000, start: W[0] }).run, undefined);
});

test('a running row left by a restart does not block a new trace', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO trace_cache(start, ts, status, json) VALUES (?,?,'running','{}')").run(W[1], 1e9 - 60);
  const rpc = { signatures: async () => [], transaction: async () => null };
  const r = startTrace({ db, rpc, labels: new Map(), solUsd: 100, now: () => 1e12, start: W[1] });
  assert.ok(r.run);
  await r.run;
  assert.equal(getTrace(db, W[1]).status, 'done');
});
