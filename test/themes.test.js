import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { config } from '../src/config.js';
import { groupThemes, currentThemes, runThemes, themeOf } from '../src/themes.js';

let n = 0;
const t = (name, vol = 100, o = {}) => ({ mint: `m${++n}`, name, symbol: `S${n}`, description: '', vol_h1: vol, ...o });

test('three tokens sharing a name word make one theme', () => {
  const { themes, tokenTheme } = groupThemes([
    t('Frog Prince', 100), t('Frog King', 200), t('Mega Frog', 300), t('Rocket Dog', 50), t('Moon Cat', 50),
  ]);
  assert.equal(themes.length, 1);
  assert.equal(themes[0].keyword, 'frog');
  assert.equal(themes[0].tokens, 3);
  assert.ok(Math.abs(themes[0].share - 0.857) < 0.01);
  assert.equal(tokenTheme.get(themes[0].members[0].mint), 'frog');
});

test('a word only in descriptions seeds no theme', () => {
  const { themes } = groupThemes(['Aaa', 'Bbb', 'Ccc'].map((x) => t(x, 100, { description: 'zebra zebra' })));
  assert.equal(themes.length, 0);
});

test('one name hit plus two descriptions is a theme of three', () => {
  const { themes } = groupThemes([t('Frog'), t('Aaa', 100, { description: 'a frog' }), t('Bbb', 100, { description: 'frog here' })]);
  assert.equal(themes[0].keyword, 'frog');
  assert.equal(themes[0].tokens, 3);
});

test('overlapping themes merge under the larger one', () => {
  const gta = [1, 2, 3, 4, 5].map((i) => t(`gta${i}`, 100, { description: 'gta', name: i <= 3 ? 'Gta Gta6 x' : 'Gta y' }));
  const { themes } = groupThemes(gta);
  assert.equal(themes.length, 1);
  assert.equal(themes[0].keyword, 'gta');
  assert.deepEqual(themes[0].aliases, ['gta6']);
  assert.equal(themes[0].tokens, 5);
});

test('same ticker is tagged clones; dominant coin is tagged one coin and sorts last', () => {
  const clones = [1, 2, 3, 4].map(() => t('Dct x', 100, { symbol: 'DCTY' })).concat([t('Dct y'), t('Dct z')]);
  const dom = [t('Pig a', 900), t('Pig b', 50), t('Pig c', 50)];
  const low = [t('Cow a', 10), t('Cow b', 10), t('Cow c', 10)];
  const { themes } = groupThemes([...clones, ...dom, ...low]);
  assert.ok(themes.find((x) => x.keyword === 'dct').tags.includes('clones'));
  assert.ok(themes.find((x) => x.keyword === 'pig').tags.includes('one coin'));
  assert.equal(themes[0].keyword, 'cow');
  assert.equal(themes.at(-1).tags.length > 0, true);
});

function seed() {
  const db = openDb(':memory:');
  const now = 2_000_000_000_000;
  const s = now / 1000;
  const ins = (mint, name, symbol, vol, created) => db.prepare(
    "INSERT INTO pool_snapshots(ts, source, pool, mint, symbol, name, created_at, vol_h1) VALUES (?, 'candidate', ?, ?, ?, ?, ?, ?)")
    .run(s - 10, 'p' + mint, mint, symbol, name, created, vol);
  return { db, now, s, ins };
}

test('currentThemes: prevShare via alias, newCoins within 6h; gating of token_theme', () => {
  const { db, now, s, ins } = seed();
  [1, 2, 3, 4, 5].forEach((i) => ins('g' + i, i <= 3 ? 'Gta Gta6 go' : 'Gta go', 'G' + i, 100, i <= 2 ? s - 3600 : s - 30 * 3600));
  [1, 2, 3].forEach((i) => ins('d' + i, 'Dog tail', 'DOGE', 100, s - 100000)); // clones, tagged
  const hour = Math.floor(s / 3600) * 3600;
  db.prepare('INSERT INTO theme_hourly VALUES (?,?,?,?,?)').run(hour - 3600, 'gta6', 3, 1, 0.3);
  const th = currentThemes(db, now, config);
  const gta = th.find((x) => x.keyword === 'gta');
  assert.equal(gta.prevShare, 0.3);
  assert.equal(gta.newCoins, 2);
  assert.equal(gta.leader.vol_h1, 100);
  assert.equal(gta.members.length, 5);
  runThemes({ db, now, config });
  assert.equal(themeOf(db, 'g1', now).keyword, 'gta');
  assert.equal(themeOf(db, 'd1', now), null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM theme_hourly WHERE hour = ?').get(hour).c, 2);
});
