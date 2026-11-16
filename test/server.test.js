import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import vm from 'node:vm';
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

function loadDashboard(narrativesPayload, watchCoins = []) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  class Node { constructor(t = '') { this._text = String(t); } get textContent() { return this._text; } set textContent(v) { this._text = String(v); } }
  class El extends Node {
    constructor(tag) {
      super('');
      this.tagName = tag.toUpperCase();
      this.attrs = {};
      this.dataset = {};
      this.children = [];
      this.hidden = false;
    }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
    set className(v) { this.attrs.class = v; }
    get className() { return this.attrs.class || ''; }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'hidden') this.hidden = true;
      if (k === 'value') this.value = String(v);
      if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v);
    }
    getAttribute(k) { return this.attrs[k]; }
    append(...kids) { this.children.push(...kids); }
    replaceChildren(...kids) { this._text = ''; this.children = [...kids]; }
    hasChildNodes() { return this.children.length > 0 || this._text.length > 0; }
    get text() { return this.textContent; }
    findAll(pred) {
      const out = [];
      const walk = (n) => { if (n instanceof El) { if (pred(n)) out.push(n); n.children.forEach(walk); } };
      walk(this);
      return out;
    }
  }
  const els = new Map(['tabs', 'market', 'watch', 'ping', 'narratives', 'tracer'].map((id) => [id, new El('section')]));
  const document = {
    createElement: (t) => new El(t),
    createElementNS: (_ns, t) => new El(t),
    createTextNode: (t) => new Node(t),
    getElementById: (id) => els.get(id),
    querySelectorAll: () => els.get('tabs').children,
  };
  let coins = [...watchCoins];
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    if (url.startsWith('/api/watch')) {
      const u = new URL(url, 'http://127.0.0.1');
      const m = u.searchParams.get('mint');
      if (opts.method === 'POST' && m && !coins.some((c) => c.mint === m)) {
        coins.unshift({ mint: m, symbol: 'NEW', name: 'New Coin', pool: null, status: 'caution', label: 'Caution', score: null, price_usd: null, mcap_usd: null, liquidity_usd: null, reasons: ['Waiting for first safety scan'], alerts: [] });
      } else if (opts.method === 'DELETE' && m) {
        coins = coins.filter((c) => c.mint !== m);
      }
      return { json: async () => ({ ok: true, coins }) };
    }
    return {
      json: async () => (url === '/api/narratives' ? narrativesPayload
        : { index: { value: null, zone: 'Neutral' }, hours: 0, warmupHours: 168, hourly: [] }),
    };
  };
  const sandbox = { Node, document, fetch, setInterval: () => {}, encodeURIComponent, Object, Set, Map, Array, Number, String, Math, Date, RegExp, URL };
  const exports = vm.runInNewContext(`${script}\n;({ PARTS, BANDS, UNKNOWNS, explainPart, bandInfo, missingList, narratives, watch, openMints, openCharts, watchedSet, show })`, sandbox);
  return { ...exports, els, calls };
}

test('narratives glossary covers every config weight, band, and unknown key', () => {
  const { PARTS, BANDS, UNKNOWNS, explainPart } = loadDashboard({});
  assert.deepEqual(Object.keys(PARTS).sort(), Object.keys(config.weights).sort());
  for (const [k, max] of Object.entries(config.weights)) {
    assert.equal(PARTS[k].max, max);
    assert.ok(PARTS[k].name);
    for (const lvl of ['Good', 'OK', 'Weak', 'None', 'No data']) assert.ok(PARTS[k].levels[lvl], `${k} missing ${lvl}`);
  }
  assert.deepEqual(Object.keys(BANDS).sort(), config.bands.map(([b]) => b).sort());
  for (const key of ['mint_authority', 'freeze_authority', 'rugged', 'transfer_fee', 'lp_unlocked', 'top10', 'insiders', 'liquidity', 'age', 'wash', ...Object.keys(config.weights)]) {
    assert.ok(UNKNOWNS[key], `UNKNOWNS missing ${key}`);
  }
  assert.equal(explainPart('wallets', { part: 'wallets', points: 0, max: 30 }, [], null).level, 'None');
  assert.equal(explainPart('wallets', { part: 'wallets', points: 0, max: 30 }, ['wallets'], null).level, 'No data');
  assert.equal(explainPart('health', { part: 'health', points: 24, max: 25 }, [], null).level, 'Good');
  assert.equal(explainPart('health', { part: 'health', points: 15, max: 25 }, [], null).level, 'OK');
  assert.equal(explainPart('health', { part: 'health', points: 5, max: 25 }, [], null).level, 'Weak');
  assert.equal(explainPart('liquidity', undefined, [], null).level, 'No data');
});

test('narratives orders cards, caps themes, handles fallbacks, and preserves open rows on refresh', async () => {
  const mintA = addr('A'), mintB = addr('B');
  const reasons = [
    { part: 'wallets', points: 0, max: 30 },
    { part: 'health', points: 16, max: 25 },
    { part: 'deployer', points: 7.5, max: 15 },
    { part: 'liquidity', points: 0, max: 15 },
    { part: 'momentum', points: 10, max: 10 },
    { part: 'narrative', points: 0, max: 5 },
  ];
  const payload = {
    running: [
      { mint: mintA, symbol: null, theme: null, score: 50, band: 'neutral', mcap_usd: 12000, reasons, unknowns: ['liquidity'] },
      { mint: mintB, symbol: 'SOCKS', theme: 'fees', score: 34, band: 'risk', mcap_usd: 5000, reasons, unknowns: [] },
    ],
    themes: Array.from({ length: 7 }, (_, i) => ({ keyword: 'word' + i, tokens: 3, volume: 1000 - i, share: 0.2 })),
    wallets: [{ address: addr('W'), label: '', class: 'unrated', bought: 1, winRate: null, medianHoldSeconds: null, stillHoldingShare: null }],
    calibration: { rows: [], missed: 0 },
  };
  const { narratives, show, els } = loadDashboard(payload);
  show('narratives');
  assert.equal(els.get('narratives').text, 'Loading…');
  await narratives();

  const root = els.get('narratives');
  assert.deepEqual(root.findAll((e) => e.tagName === 'H2').map((e) => e.text), [
    'Running now',
    'Themes this hour',
    'Best calls: wallet scorecard',
    'Calibration: later price by score band',
  ]);
  const runningCard = root.children[0];
  const rows = runningCard.findAll((e) => e.className === 'grid');
  assert.match(rows[0].text, /AAAA…1111/);
  assert.match(rows[0].text, /no theme/);
  assert.match(rows[0].text, /easy to sell/);

  const themesCard = root.children[1];
  assert.equal(themesCard.findAll((e) => e.className === 'trow').length, 5);
  const moreBtn = themesCard.findAll((e) => e.tagName === 'BUTTON')[0];
  assert.equal(moreBtn.text, 'Show all 7 themes');
  moreBtn.onclick();
  assert.equal(themesCard.findAll((e) => e.className === 'trow').length, 7);
  assert.equal(themesCard.findAll((e) => e.tagName === 'BUTTON')[0].text, 'Show top 5');

  const walletsCard = root.children[2];
  assert.match(walletsCard.text, /not enough trades yet/);
  assert.doesNotMatch(walletsCard.text, /\bunknown\b/);
  assert.match(root.children[3].text, /No results yet\. The tool checks each coin's price 1, 6 and 24 hours later\./);

  const btnA = runningCard.findAll((e) => e.tagName === 'BUTTON')[0];
  const whyA = runningCard.findAll((e) => e.className === 'why')[0];
  assert.equal(btnA.text, 'Explain score');
  assert.equal(whyA.hidden, true);
  btnA.onclick();
  assert.equal(btnA.text, 'Hide');
  assert.equal(whyA.hidden, false);
  assert.equal(whyA.findAll((e) => e.className === 'part').length, 6);
  assert.doesNotMatch(whyA.text, /\|/);

  await narratives();
  const refreshedRunning = root.children[0];
  const explainBtns = refreshedRunning.findAll((e) => e.tagName === 'BUTTON' && (e.text === 'Explain score' || e.text === 'Hide'));
  assert.equal(explainBtns[0].text, 'Hide');
  assert.equal(refreshedRunning.findAll((e) => e.className === 'why')[0].hidden, false);
  assert.equal(explainBtns[1].text, 'Explain score');
  assert.equal(refreshedRunning.findAll((e) => e.className === 'why')[1].hidden, true);
  assert.equal(root.children[1].findAll((e) => e.className === 'trow').length, 7);
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

test('Watch tab renders hold badges, plain-English reasons, ping table, and toggles lazy chart iframe across refreshes', async () => {
  const mintSafe = addr('S'), mintFlag = addr('F'), poolSafe = addr('P');
  const seeded = [
    {
      mint: mintSafe, symbol: 'GOOD', name: 'Good Coin', pool: poolSafe,
      status: 'safe', label: 'Safe to hold', score: 78, price_usd: 0.025, mcap_usd: 250000, liquidity_usd: 55000,
      reasons: ['Passed all safety checks with no recent exit alerts'],
      alerts: [{ ts: 1700000000, kind: 'consensus', mint: mintSafe, wallet: null, detail: { wallets: ['a', 'b', 'c'], mcap: 200000 } }],
    },
    {
      mint: mintFlag, symbol: 'RUG', name: 'Rug Coin', pool: null,
      status: 'flag', label: 'Red flag', score: 0, price_usd: 0.0001, mcap_usd: 1000, liquidity_usd: 500,
      reasons: ['Mint authority is still active (new tokens can be minted)', 'Creator wallet sold or moved tokens in the last 24 hours'],
      alerts: [{ ts: 1700000100, kind: 'exit_deployer', mint: mintFlag, wallet: addr('D'), detail: { side: 'sell' } }],
    },
  ];
  const { watch, show, els, calls } = loadDashboard({ running: [], themes: [], wallets: [], calibration: { rows: [], missed: 0 } }, seeded);
  show('watch');
  await watch();

  const root = els.get('watch');
  assert.match(root.text, /Safe to hold/);
  assert.match(root.text, /Red flag/);
  assert.match(root.text, /Mint authority is still active/);
  assert.match(root.text, /creator sell/);
  assert.equal(root.findAll((e) => e.tagName === 'IFRAME').length, 0);

  const chartBtns = root.findAll((e) => e.tagName === 'BUTTON' && (e.text === 'Show chart' || e.text === 'Hide chart'));
  assert.equal(chartBtns.length, 2);
  chartBtns[0].onclick();
  assert.equal(chartBtns[0].text, 'Hide chart');
  const iframes = root.findAll((e) => e.tagName === 'IFRAME');
  assert.equal(iframes.length, 1);
  assert.match(iframes[0].getAttribute('src'), new RegExp(`https://dexscreener\\.com/solana/${poolSafe}\\?embed=1`));

  // Refresh preserves the exact same iframe DOM element in-place (never detached or reloaded)
  await watch();
  const iframesAfterRefresh = root.findAll((e) => e.tagName === 'IFRAME');
  assert.equal(iframesAfterRefresh.length, 1);
  assert.equal(iframesAfterRefresh[0], iframes[0]);
  const refreshedChartBtn = root.findAll((e) => e.tagName === 'BUTTON' && (e.text === 'Show chart' || e.text === 'Hide chart'))[0];
  assert.equal(refreshedChartBtn.text, 'Hide chart');

  // Hide chart removes the iframe
  refreshedChartBtn.onclick();
  assert.equal(root.findAll((e) => e.tagName === 'IFRAME').length, 0);

  // Add a watched coin via the input form
  const input = root.findAll((e) => e.tagName === 'INPUT')[0];
  const watchBtnEl = root.findAll((e) => e.tagName === 'BUTTON' && e.text === 'Watch coin')[0];
  input.value = 'invalid';
  await watchBtnEl.onclick();
  assert.match(root.text, /not a valid Solana mint address/);

  const mintNew = addr('N');
  input.value = mintNew;
  await watchBtnEl.onclick();
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.includes(mintNew)));
  assert.match(root.text, /Waiting for first safety scan/);
});

test('Narratives hydrates watchedSet before visiting Watch so watched coins render as Watching and unwatch on click', async () => {
  const mintWatched = addr('W');
  const seeded = [
    {
      mint: mintWatched, symbol: 'WTC', name: 'Watched Coin', pool: addr('P'),
      status: 'safe', label: 'Safe to hold', score: 80, price_usd: 0.1, mcap_usd: 100000, liquidity_usd: 50000,
      reasons: ['Passed all safety checks with no recent exit alerts'], alerts: [],
    },
  ];
  const payload = {
    running: [{ mint: mintWatched, symbol: 'WTC', theme: null, score: 80, band: 'strong', mcap_usd: 100000, reasons: [], unknowns: [] }],
    themes: [],
    wallets: [],
    calibration: { rows: [], missed: 0 },
  };
  const { narratives, els, calls } = loadDashboard(payload, seeded);
  await narratives();

  const root = els.get('narratives');
  const toggleBtn = root.findAll((e) => e.tagName === 'BUTTON' && (e.text === 'Watch' || e.text === 'Watching'))[0];
  assert.equal(toggleBtn.text, 'Watching');
  assert.equal(toggleBtn.getAttribute('aria-pressed'), 'true');

  await toggleBtn.onclick();
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.includes(mintWatched)));
  const refreshedBtn = root.findAll((e) => e.tagName === 'BUTTON' && (e.text === 'Watch' || e.text === 'Watching'))[0];
  assert.equal(refreshedBtn.text, 'Watch');
  assert.equal(refreshedBtn.getAttribute('aria-pressed'), 'false');
});
