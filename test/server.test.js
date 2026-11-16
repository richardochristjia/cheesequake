import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

function collectClientSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectClientSources(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test('hostile token name travels as JSON and client/src never assigns markup', async () => {
  const { server, base } = await boot();
  try {
    const n = await (await fetch(base + '/api/narratives')).json();
    assert.equal(n.running[0].name, HOSTILE);
    const clientSrc = fileURLToPath(new URL('../client/src', import.meta.url));
    const files = collectClientSources(clientSrc);
    assert.ok(files.length > 0);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write/.test(src), `unsafe markup API in ${file}`);
    }
  } finally { server.close(); server.closeAllConnections(); }
});

test('serves static assets from public/dist and blocks path traversal', async () => {
  const { server, base } = await boot();
  try {
    const assetsDir = fileURLToPath(new URL('../public/dist/assets', import.meta.url));
    const jsAsset = readdirSync(assetsDir).find((f) => f.endsWith('.js'));
    assert.ok(jsAsset, 'expected built JS asset in public/dist/assets');
    const assetRes = await fetch(`${base}/assets/${jsAsset}`);
    assert.equal(assetRes.status, 200);
    assert.match(assetRes.headers.get('content-type') || '', /javascript/);

    const travRes = await raw(server.address().port, 'GET /assets/%2e%2e/%2e%2e/package.json HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    assert.match(travRes, /^HTTP\/1\.1 404/);
  } finally { server.close(); server.closeAllConnections(); }
});

// Raw request, since fetch normalises URLs.
function raw(port, head) {
  return new Promise((resolve, reject) => {
    let out = '';
    const sock = net.connect(port, '127.0.0.1', () => sock.write(head));
    sock.setTimeout(2000, () => { sock.destroy(); resolve(out); });
    sock.on('data', (d) => { out += d; }).on('end', () => resolve(out)).on('error', reject);
  });
}

test('a malformed request line gets an error reply and the server stays up', async () => {
  const { server, base } = await boot();
  try {
    const res = await raw(server.address().port, 'GET //[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    assert.match(res, /^HTTP\/1\.1 5\d\d/);
    assert.equal((await fetch(base + '/api/market')).status, 200);
  } finally { server.close(); server.closeAllConnections(); }
});

test('a foreign Host header gets 403, a loopback one gets 200', async () => {
  const { server } = await boot();
  const port = server.address().port;
  const get = (host) => raw(port, `GET /api/market HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
  try {
    assert.match(await get('evil.example'), /^HTTP\/1\.1 403/);
    assert.match(await get(`127.0.0.1:${port}`), /^HTTP\/1\.1 200/);
  } finally { server.close(); server.closeAllConnections(); }
});

test('/api/watch CRUD, validation, onWatch callback, and method guards', async () => {
  const db = openDb(':memory:');
  const watched = [];
  const mint = addr('M');
  const pool = addr('P');
  db.prepare('INSERT INTO tokens(mint, symbol, name, creator) VALUES (?,?,?,?)').run(mint, 'WIF', 'dogwifhat', addr('D'));
  db.prepare("INSERT INTO pool_snapshots(ts, source, pool, mint, symbol, name, price_usd, mcap_usd, liquidity_usd) VALUES (?, 'candidate', ?, ?, 'WIF', 'dogwifhat', 1.25, 1250000, 90000)").run(NOW / 1000 - 30, pool, mint);
  db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd) VALUES (?,?,80,'strong',1,'[]','[]','[]',1.25,1250000)").run(NOW / 1000 - 30, mint);

  const server = await startServer({
    db, config, tracer: { start: () => ({}), get: () => ({}) },
    onWatch: (m) => watched.push(m), now: () => NOW,
  }, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(base + '/api/watch')).json(), { coins: [] });
    assert.equal((await fetch(base + '/api/watch?mint=bad', { method: 'POST' })).status, 400);
    assert.equal((await fetch(base + '/api/watch?mint=bad', { method: 'DELETE' })).status, 400);
    assert.equal((await fetch(base + '/api/watch', { method: 'PUT' })).status, 405);
    assert.equal((await fetch(base + '/api/market', { method: 'POST' })).status, 405);

    const added = await (await fetch(base + '/api/watch?mint=' + mint, { method: 'POST' })).json();
    assert.equal(added.ok, true);
    assert.equal(added.coins.length, 1);
    assert.equal(added.coins[0].mint, mint);
    assert.equal(added.coins[0].status, 'safe');
    assert.equal(added.coins[0].label, 'Safe to hold');
    assert.equal(added.coins[0].pool, pool);
    assert.deepEqual(watched, [mint]);

    const removed = await (await fetch(base + '/api/watch?mint=' + mint, { method: 'DELETE' })).json();
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.coins, []);
  } finally { server.close(); server.closeAllConnections(); }
});

test('/api/ping and /api/watch enrich wallet labels, filter by wallet (direct + consensus), compose with kind, and reject invalid wallet addresses', async () => {
  const db = openDb(':memory:');
  const mint = addr('M');
  const wAlice = addr('A');
  const wBob = addr('B');
  const wUnlabeled = addr('U');
  const wStranger = addr('S');
  db.prepare('INSERT INTO tokens(mint, symbol, name, creator) VALUES (?,?,?,?)').run(mint, 'PEPE', 'Pepe', addr('D'));
  db.prepare('INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)').run(mint, NOW / 1000 - 100);
  const insAlert = db.prepare('INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,?,?,?,?,?)');
  insAlert.run(NOW / 1000 - 30, 'buy', mint, wAlice, '{"usd":500}', 'a-buy');
  insAlert.run(NOW / 1000 - 20, 'exit_wallet', mint, wBob, '{"usd":300}', 'b-exit');
  insAlert.run(NOW / 1000 - 10, 'consensus', mint, null, JSON.stringify({ wallets: [wAlice, wBob, wUnlabeled], mcap: 90000 }), 'ab-cons');
  // Seed >200 newer consensus alerts for other wallets to verify SQL/JS filtering does not drop wAlice's history
  const otherMint = addr('X');
  for (let i = 0; i < 205; i++) {
    insAlert.run(NOW / 1000 + i, 'consensus', otherMint, null, JSON.stringify({ wallets: [wStranger], mcap: 1000 }), `s-cons-${i}`);
  }

  const walletList = [
    { address: wAlice, label: 'alice' },
    { address: wBob, label: 'bob' },
    { address: wUnlabeled, label: null },
  ];
  const server = await startServer({
    db, config, tracer: { start: () => ({}), get: () => ({}) },
    wallets: () => walletList, now: () => NOW,
  }, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const badRes = await fetch(`${base}/api/ping?wallet=not-base58!`);
    assert.equal(badRes.status, 400);
    assert.deepEqual(await badRes.json(), { error: 'invalid wallet address' });

    const byAlice = await (await fetch(`${base}/api/ping?wallet=${wAlice}`)).json();
    assert.deepEqual(byAlice.wallets, walletList);
    assert.equal(byAlice.alerts.length, 2);
    assert.equal(byAlice.alerts[0].kind, 'consensus');
    assert.equal(byAlice.alerts[0].wallet_label, null);
    assert.deepEqual(byAlice.alerts[0].detail.wallet_labels, { [wAlice]: 'alice', [wBob]: 'bob' });
    assert.equal(byAlice.alerts[1].kind, 'buy');
    assert.equal(byAlice.alerts[1].wallet, wAlice);
    assert.equal(byAlice.alerts[1].wallet_label, 'alice');

    const byAliceBuy = await (await fetch(`${base}/api/ping?wallet=${wAlice}&kind=buy`)).json();
    assert.equal(byAliceBuy.alerts.length, 1);
    assert.equal(byAliceBuy.alerts[0].kind, 'buy');
    assert.equal(byAliceBuy.alerts[0].wallet_label, 'alice');

    const byBobExit = await (await fetch(`${base}/api/ping?wallet=${wBob}&kind=exit`)).json();
    assert.equal(byBobExit.alerts.length, 1);
    assert.equal(byBobExit.alerts[0].kind, 'exit_wallet');
    assert.equal(byBobExit.alerts[0].wallet_label, 'bob');

    const watchRes = await (await fetch(`${base}/api/watch`)).json();
    assert.equal(watchRes.coins.length, 1);
    const coinAlerts = watchRes.coins[0].alerts;
    const buyAlert = coinAlerts.find((a) => a.kind === 'buy');
    const consAlert = coinAlerts.find((a) => a.kind === 'consensus' && a.detail.wallets.includes(wAlice));
    assert.equal(buyAlert.wallet_label, 'alice');
    assert.deepEqual(consAlert.detail.wallet_labels, { [wAlice]: 'alice', [wBob]: 'bob' });
  } finally { server.close(); server.closeAllConnections(); }
});
