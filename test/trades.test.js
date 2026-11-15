import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, WSOL } from '../src/trades.js';
import { tx } from './helpers.js';

const W = 'W'.repeat(4) + '1'.repeat(36);
const M = 'M'.repeat(4) + '1'.repeat(36);

test('token up, SOL down is one buy', () => {
  const r = classify(tx({ wallet: W }), W, 100);
  assert.equal(r.length, 1);
  assert.equal(r[0].side, 'buy');
  assert.equal(r[0].mint, M);
  assert.ok(Math.abs(r[0].quoteUsd - 100) < 0.01);
});

test('plain transfer in records nothing', () => {
  assert.deepEqual(classify(tx({ sol: 0 }), W, 100), []);
});

test('token down, SOL up is a sell; down with no payment is out', () => {
  assert.equal(classify(tx({ token: -50, sol: 2 }), W, 100)[0].side, 'sell');
  assert.equal(classify(tx({ token: -50, sol: 0 }), W, 100)[0].side, 'out');
});

test('failed or null tx is ignored', () => {
  assert.deepEqual(classify(null, W, 100), []);
  const t = tx({}); t.meta.err = {};
  assert.deepEqual(classify(t, W, 100), []);
});

test('wrapped SOL leg counts as payment', () => {
  const t = tx({ sol: 0 });
  t.meta.preTokenBalances.push({ owner: W, mint: WSOL, uiTokenAmount: { uiAmount: 2 } });
  t.meta.postTokenBalances.push({ owner: W, mint: WSOL, uiTokenAmount: { uiAmount: 1 } });
  assert.equal(classify(t, W, 100)[0].side, 'buy');
});
