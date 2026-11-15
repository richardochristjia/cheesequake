import test from 'node:test';
import assert from 'node:assert/strict';
import { scorecard } from '../src/scorecard.js';

const t = (mint, side, ts, usd = 10, amt = 100) => ({ mint, side, ts, quote_usd: usd, token_amount: amt });

test('four mints bought: unrated, weight 0.5', () => {
  const s = scorecard(['a', 'b', 'c', 'd'].map((m) => t(m, 'buy', 100)));
  assert.equal(s.class, 'unrated');
  assert.equal(s.weight, 0.5);
  assert.equal(s.stillHoldingShare, 1);
});

test('fast flips make a sniper', () => {
  const s = scorecard(['a', 'b', 'c'].flatMap((m) => [t(m, 'buy', 100), t(m, 'sell', 160, 20)]));
  assert.equal(s.class, 'sniper');
  assert.equal(s.weight, 0);
  assert.equal(s.winRate, 1);
});

test('ten patient mints make a rated wallet', () => {
  const ms = 'abcdefghij'.split('');
  const s = scorecard(ms.flatMap((m) => [t(m, 'buy', 100), t(m, 'sell', 5000, 5)]));
  assert.equal(s.class, 'rated');
  assert.equal(s.winRate, 0);
});
