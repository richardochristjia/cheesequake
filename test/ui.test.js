import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadUi({ watchCoins = [], pingPayload = { alerts: [], wallets: [] } } = {}) {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let innerHtmlAssigned = false;

  class Node {
    constructor(t = '') {
      this._text = String(t);
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
  }

  class El extends Node {
    constructor(tag) {
      super('');
      this.tagName = tag.toUpperCase();
      this.attrs = {};
      this.dataset = {};
      this.children = [];
      this.hidden = false;
    }
    set innerHTML(_v) { innerHtmlAssigned = true; }
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

  const fetch = async (url) => {
    if (url.startsWith('/api/watch')) return { json: async () => ({ ok: true, coins: watchCoins }) };
    if (url.startsWith('/api/ping')) return { json: async () => pingPayload };
    return { json: async () => ({}) };
  };

  const sandbox = { Node, document, fetch, setInterval: () => {}, encodeURIComponent, Object, Set, Map, Array, Number, String, Math, Date, RegExp, URL };
  const exports = vm.runInNewContext(`${script}\n;({ KIND_INFO, kindCell, watch, ping })`, sandbox);
  return { ...exports, els, wasInnerHtmlAssigned: () => innerHtmlAssigned };
}

const EXPECTED_KINDS = [
  'buy',
  'sell',
  'consensus',
  'exit_deployer',
  'exit_wallet',
  'exit_liquidity',
  'exit_divergence',
];

test('KIND_INFO defines plain-English explanations for all 7 alert kinds', () => {
  const { KIND_INFO } = loadUi();
  assert.deepEqual(Object.keys(KIND_INFO).sort(), [...EXPECTED_KINDS].sort());
  for (const kind of EXPECTED_KINDS) {
    assert.equal(typeof KIND_INFO[kind], 'string');
    assert.ok(KIND_INFO[kind].trim().length > 10, `${kind} description should be non-trivial`);
  }
});

test('kindCell renders accessible tooltip for known kinds, handles unknown kinds, and is XSS-safe', () => {
  const { KIND_INFO, kindCell, wasInnerHtmlAssigned } = loadUi();

  for (const kind of EXPECTED_KINDS) {
    const el = kindCell(kind);
    assert.equal(el.className, 'info-tip');
    const btns = el.findAll((n) => n.tagName === 'BUTTON');
    assert.equal(btns.length, 1);
    assert.equal(btns[0].getAttribute('type'), 'button');
    assert.equal(btns[0].textContent, 'ⓘ');
    assert.ok(btns[0].getAttribute('aria-label')?.includes(kind));

    const tips = el.findAll((n) => n.getAttribute('role') === 'tooltip');
    assert.equal(tips.length, 1);
    assert.equal(tips[0].className, 'tip-box');
    assert.equal(tips[0].textContent, KIND_INFO[kind]);
  }

  assert.equal(kindCell('unknown_kind'), 'unknown_kind');
  assert.equal(kindCell('toString'), 'toString');
  assert.equal(kindCell(null), '');
  assert.equal(kindCell(undefined), '');

  const hostile = '<img src=x onerror=alert(1)>';
  assert.equal(kindCell(hostile), hostile);
  assert.equal(wasInnerHtmlAssigned(), false);
});

test('Watch and Ping alert tables render kindCell tooltips instead of raw kind strings', async () => {
  const mint = 'So11111111111111111111111111111111111111112';
  const wallet = 'Wallet1111111111111111111111111111111111111';
  const watchCoins = [{
    mint,
    symbol: 'TEST',
    name: 'Test Coin',
    pool: null,
    status: 'flag',
    label: 'Flag',
    score: 50,
    price_usd: 0.01,
    mcap_usd: 100000,
    liquidity_usd: 20000,
    reasons: ['Creator sold'],
    alerts: [
      { ts: 1700000000, kind: 'exit_deployer', mint, wallet, detail: { side: 'sell', usd: 500 } },
      { ts: 1700000100, kind: 'custom_unknown', mint, wallet, detail: {} },
    ],
  }];
  const pingPayload = {
    wallets: [{ address: wallet, label: 'alice' }],
    alerts: [
      { ts: 1700000000, kind: 'exit_liquidity', mint, symbol: 'TEST', wallet: null, detail: { from: 50000, to: 10000 } },
      { ts: 1700000100, kind: 'consensus', mint, symbol: 'TEST', wallet: null, detail: { wallets: [wallet], mcap: 90000 } },
    ],
  };

  const { KIND_INFO, watch, ping, els, wasInnerHtmlAssigned } = loadUi({ watchCoins, pingPayload });

  await watch();
  const watchTips = els.get('watch').findAll((n) => n.getAttribute('role') === 'tooltip');
  assert.equal(watchTips.length, 1);
  assert.equal(watchTips[0].textContent, KIND_INFO.exit_deployer);
  const watchButtons = els.get('watch').findAll((n) => n.tagName === 'BUTTON' && n.className === 'info-btn');
  assert.equal(watchButtons.length, 1);
  assert.match(els.get('watch').textContent, /custom_unknown/);

  await ping();
  const pingTips = els.get('ping').findAll((n) => n.getAttribute('role') === 'tooltip');
  assert.equal(pingTips.length, 2);
  assert.equal(pingTips[0].textContent, KIND_INFO.exit_liquidity);
  assert.equal(pingTips[1].textContent, KIND_INFO.consensus);
  assert.equal(wasInnerHtmlAssigned(), false);
});
