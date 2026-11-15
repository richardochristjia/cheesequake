import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/http.js';

const res = (status, body) => ({ status, ok: status < 400, json: async () => body });
function make(responses) {
  const sleeps = [];
  let t = 0;
  const calls = [];
  const fetch = async (u) => { calls.push(u); return responses.shift(); };
  const get = createClient({
    fetch, sleep: async (ms) => { sleeps.push(ms); t += ms; }, now: () => t,
    minGapMs: 100, retry: { tries: 4, waitsMs: [5, 15, 45] },
  });
  return { get, sleeps, calls };
}

test('retries after HTTP 429', async () => {
  const { get, sleeps, calls } = make([res(429), res(200, { ok: 1 })]);
  assert.deepEqual(await get('u'), { ok: 1 });
  assert.equal(calls.length, 2);
  assert.ok(sleeps.includes(5));
});

test('retries after 200 with error.code 429', async () => {
  const { get, calls } = make([res(200, { error: { code: 429 } }), res(200, { ok: 2 })]);
  assert.deepEqual(await get('u'), { ok: 2 });
  assert.equal(calls.length, 2);
});

test('gives up with SOURCE_UNAVAILABLE', async () => {
  const { get } = make([res(500), res(500), res(500), res(500)]);
  await assert.rejects(get('u'), { code: 'SOURCE_UNAVAILABLE' });
});

test('client keeps working after a failure', async () => {
  const { get } = make([res(404), res(200, { ok: 3 })]);
  await assert.rejects(get('u'), { code: 'SOURCE_UNAVAILABLE' });
  assert.deepEqual(await get('u'), { ok: 3 });
});
