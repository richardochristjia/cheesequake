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

function loadDashboard(narrativesPayload) {
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
  const els = new Map(['tabs', 'market', 'ping', 'narratives', 'tracer'].map((id) => [id, new El('section')]));
  const document = {
    createElement: (t) => new El(t),
    createElementNS: (_ns, t) => new El(t),
    createTextNode: (t) => new Node(t),
    getElementById: (id) => els.get(id),
    querySelectorAll: () => els.get('tabs').children,
  };
  const fetch = async (url) => ({
    json: async () => (url === '/api/narratives' ? narrativesPayload
      : { index: { value: null, zone: 'Neutral' }, hours: 0, warmupHours: 168, hourly: [] }),
  });
  const sandbox = { Node, document, fetch, setInterval: () => {}, encodeURIComponent, Object, Set, Map, Array, Number, String, Math, Date, RegExp, URL };
  const exports = vm.runInNewContext(`${script}\n;({ PARTS, BANDS, UNKNOWNS, explainPart, bandInfo, missingList, narratives, openMints, show })`, sandbox);
  return { ...exports, els };
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
  assert.equal(refreshedRunning.findAll((e) => e.tagName === 'BUTTON')[0].text, 'Hide');
  assert.equal(refreshedRunning.findAll((e) => e.className === 'why')[0].hidden, false);
  assert.equal(refreshedRunning.findAll((e) => e.tagName === 'BUTTON')[1].text, 'Explain score');
  assert.equal(refreshedRunning.findAll((e) => e.className === 'why')[1].hidden, true);
  assert.equal(root.children[1].findAll((e) => e.className === 'trow').length, 7);
});
