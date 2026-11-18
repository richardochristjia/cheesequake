import test from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../src/sources/solana.js';

test('createRpc().transaction() requests maxSupportedTransactionVersion: 1', async () => {
  let seen = null;
  const rpc = createRpc(async (url, opts) => {
    seen = { url, body: JSON.parse(opts.body) };
    return { result: { blockTime: 123 } };
  }, 'http://rpc.local');

  const res = await rpc.transaction('sig-1');
  assert.deepEqual(res, { blockTime: 123 });
  assert.equal(seen.url, 'http://rpc.local');
  assert.equal(seen.body.method, 'getTransaction');
  assert.deepEqual(seen.body.params, [
    'sig-1',
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 },
  ]);
});

test('tokensMulti keeps real images and drops null and missing.png', async () => {
  const { tokensMulti } = await import('../src/sources/geckoterminal.js');
  const row = (a, image_url) => ({ id: 'solana_' + a, attributes: { address: a, image_url } });
  const get = async () => ({ data: [row('A', 'https://x/a.png'), row('B', 'https://x/missing.png'), row('C', null), { id: 'solana_D' }] });
  assert.deepEqual(await tokensMulti(get, ['A', 'B', 'C', 'D']), [{ mint: 'A', image_url: 'https://x/a.png' }]);
  assert.deepEqual(await tokensMulti(async () => ({ data: 'x' }), ['A']), []);
});
