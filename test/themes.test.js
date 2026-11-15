import test from 'node:test';
import assert from 'node:assert/strict';
import { groupThemes } from '../src/themes.js';

test('three tokens sharing a keyword make one theme', () => {
  const t = (mint, name, vol) => ({ mint, name, symbol: name.slice(0, 4), description: '', vol_h1: vol });
  const { themes, tokenTheme } = groupThemes([
    t('1', 'Frog Prince', 100), t('2', 'Frog King', 200), t('3', 'Mega Frog', 300), t('4', 'Rocket Dog', 50), t('5', 'Moon Cat', 50),
  ]);
  assert.equal(themes.length, 1);
  assert.equal(themes[0].keyword, 'frog');
  assert.equal(themes[0].tokens, 3);
  assert.ok(Math.abs(themes[0].share - 0.857) < 0.01);
  assert.equal(tokenTheme.get('1'), 'frog');
  assert.equal(tokenTheme.has('4'), false);
});
