import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../src/db.js';
import { config } from '../src/config.js';
import { startServer } from '../src/server.js';
import { addr } from './helpers.js';

const NOW = 2_000_000_000_000;
const HOSTILE = '<img src=x onerror=1>';

async function boot() {
  const db = openDb(':memory:');
  const mint = addr('M');
  const hr = Math.floor(NOW / 1000 / 3600) * 3600;
  db.prepare("INSERT INTO tokens(mint, symbol, name, creator) VALUES (?,?,?,?)").run(mint, 'HOT', HOSTILE, addr('D'));
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,82,'strong',1,'[]','[{\"part\":\"wallets\",\"points\":20,\"max\":30,\"note\":\"x\"}]','[]',1,1000)").run(NOW / 1000 - 60, mint);
  db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,'consensus',?,NULL,'{\"wallets\":[]}','d1')").run(NOW / 1000, mint);
  db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,'exit_wallet',?,NULL,'{}','d2')").run(NOW / 1000, mint);
  db.prepare('INSERT INTO theme_hourly VALUES (?,?,?,?,?)').run(hr, 'frog', 3, 10, 0.5);
  for (let i = 0; i < 200; i++) db.prepare('INSERT INTO market_hourly VALUES (?,?,?,?,?,?,?,?)').run(i * 3600, i % 7, 0.5, i, 1, 0, 50, 'Neutral');
  const tracer = { start: () => ({ status: 'running' }), get: () => ({ status: 'running', nodes: [], edges: [] }) };
  const server = await startServer({ db, config, tracer, wallets: () => [{ address: addr('W'), label: 'w' }], now: () => NOW }, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, db };
}

test('four API routes and the page serve from a seeded store, on 127.0.0.1 only', async () => {
  const { server, base } = await boot();
  try {
    assert.equal(server.address().address, '127.0.0.1');
    const j = async (p) => (await fetch(base + p)).json();
    const m = await j('/api/market');
    assert.ok(Number.isInteger(m.index.value) && m.index.zone);
    assert.equal(m.hourly.length, 200);
    assert.equal((await j('/api/ping')).alerts.length, 2);
    assert.equal((await j('/api/ping?kind=exit')).alerts.length, 1);
    const n = await j('/api/narratives');
    assert.equal(n.running.length, 1);
    assert.equal(n.themes.length, 1);
    assert.equal(n.wallets.length, 1);
    assert.equal((await j('/api/tracer?wallet=' + addr('W'))).status, 'running');
    assert.equal((await fetch(base + '/api/tracer?wallet=bad')).status, 400);
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Cheesequake/);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/nope')).status, 404);
  } finally { server.close(); server.closeAllConnections(); }
});

test('hostile token name travels as JSON and the page never assigns markup', async () => {
  const { server, base } = await boot();
  try {
    const n = await (await fetch(base + '/api/narratives')).json();
    assert.equal(n.running[0].name, HOSTILE);
    const src = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src));
  } finally { server.close(); server.closeAllConnections(); }
});
