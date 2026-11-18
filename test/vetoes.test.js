import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/vetoes.js';
import { normalise } from '../src/sources/rugcheck.js';

const NOW = 2_000_000_000_000;
const market = (o = {}) => ({
  dex: 'raydium', created_at: NOW / 1000 - 3600 * 5, liquidity_usd: 50000,
  vol_h1: 6000, vol_h6: 30000, buyers_h1: 100, buyers_h6: 300, ...o,
});
const raw = (o = {}) => ({
  mint: 'm', mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], transferFee: {},
  markets: [{ lp: { lpLockedPct: 100, quoteUSD: 1, baseUSD: 1 } }], topHolders: [{ address: 'a', owner: 'o', pct: 5 }],
  knownAccounts: {}, insiderNetworks: [], ...o,
});
const run = (mo = {}, ro = {}, mintInfo = null, names) =>
  evaluate({ market: market(mo), report: ro === null ? null : normalise(raw(ro)), mintInfo, now: NOW, names });

test('clean token has no vetoes and no unknowns', () => {
  assert.deepEqual(run(), { vetoes: [], unknowns: [] });
});

test('each veto fires on its own input', () => {
  const cases = {
    mint_authority: [{}, { mintAuthority: 'X' }],
    freeze_authority: [{}, { freezeAuthority: 'X' }],
    rugged: [{}, { rugged: true }],
    transfer_fee: [{}, { transferFee: { pct: 5 } }],
    lp_unlocked: [{}, { markets: [{ lp: { lpLockedPct: 10, quoteUSD: 1, baseUSD: 1 } }] }],
    top10: [{}, { topHolders: [{ address: 'a', owner: 'o', pct: 30 }] }],
    insiders: [{}, { insiderNetworks: [{ currentHolding: 300 }], token: { supply: 1000 } }],
    liquidity: [{ liquidity_usd: 500 }, {}],
    age: [{ created_at: NOW / 1000 - 120 }, {}],
    wash: [{ buyers_h1: 5, vol_h1: 90000 }, {}],
    inactive: [{ buyers_h1: 3 }, {}],
  };
  for (const [name, [m, r]] of Object.entries(cases)) assert.ok(run(m, r).vetoes.includes(name), name);
});

test('danger-level risk counts as rugged', () => {
  assert.ok(run({}, { risks: [{ name: 'x', level: 'danger' }] }).vetoes.includes('rugged'));
});

test('known accounts are left out of the top10 sum', () => {
  const r = { topHolders: [{ address: 'lp', owner: 'lp', pct: 60 }], knownAccounts: { lp: { name: 'pool' } } };
  assert.ok(!run({}, r).vetoes.includes('top10'));
});

test('authority mismatch: report revoked, RPC active is vetoed', () => {
  const v = run({}, {}, { mintAuthority: 'SomeKey', freezeAuthority: null });
  assert.ok(v.vetoes.includes('mint_authority'));
  assert.ok(!v.vetoes.includes('freeze_authority'));
});

test('missing report lists unknowns, never a pass', () => {
  const v = run({}, null);
  for (const n of ['mint_authority', 'rugged', 'lp_unlocked', 'top10', 'insiders']) assert.ok(v.unknowns.includes(n), n);
});

test('RPC alone can clear the authority checks', () => {
  const v = run({}, null, { mintAuthority: null, freezeAuthority: null });
  assert.ok(!v.unknowns.includes('mint_authority'));
});

test('bonding curve is exempt from lp_unlocked only', () => {
  const r = { markets: [{ lp: { lpLockedPct: 0, quoteUSD: 1, baseUSD: 1 } }], mintAuthority: 'X' };
  const v = run({ dex: 'pump-fun' }, r);
  assert.ok(!v.vetoes.includes('lp_unlocked'));
  assert.ok(v.vetoes.includes('mint_authority'));
});

test('names limits the rules run', () => {
  assert.deepEqual(run({ liquidity_usd: 1 }, null, null, ['liquidity']), { vetoes: ['liquidity'], unknowns: [] });
});

test('inactive: pass at 25 buyers, falls back to buys_h1, unknown when both are null', () => {
  const v = (o) => run(o, {}, null, ['inactive']);
  assert.deepEqual(v({ buyers_h1: 25 }), { vetoes: [], unknowns: [] });
  assert.deepEqual(v({ buyers_h1: null, buys_h1: 3 }).vetoes, ['inactive']);
  assert.deepEqual(v({ buyers_h1: null, buys_h1: 30 }), { vetoes: [], unknowns: [] });
  assert.deepEqual(v({ buyers_h1: null, buys_h1: null }).unknowns, ['inactive']);
});
