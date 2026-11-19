import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup, act } from '@testing-library/react';
import App from '../App';
import { Layout } from '../components/Layout';
import { KindTooltip } from '../components/KindTooltip';
import { AddressLink, WatchButton } from '../components/ui';
import { KIND_INFO, PARTS, BANDS, UNKNOWNS, explainPart } from '../lib/glossary';
import type { WatchCoin } from '../types';

const addr = (ch: string) => ch.repeat(4) + '1'.repeat(40);

const EXPECTED_KINDS = [
  'buy',
  'sell',
  'consensus',
  'exit_deployer',
  'exit_wallet',
  'exit_liquidity',
  'exit_divergence',
];

function mockFetch(handlers: {
  market?: unknown;
  watch?: () => unknown;
  ping?: (url: string) => unknown;
  narratives?: () => unknown;
  tracer?: (url: string) => unknown;
  onCall?: (url: string, method: string) => void;
}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    handlers.onCall?.(url, method);

    let body: unknown = {};
    if (url.startsWith('/api/market')) {
      body = handlers.market ?? {
        index: { value: null, zone: 'warming up' },
        hours: 0,
        warmupHours: 168,
        hourly: [],
      };
    } else if (url.startsWith('/api/watch')) {
      body = handlers.watch ? handlers.watch() : { ok: true, coins: [] };
    } else if (url.startsWith('/api/ping')) {
      body = handlers.ping ? handlers.ping(url) : { alerts: [], wallets: [] };
    } else if (url.startsWith('/api/narratives')) {
      body = handlers.narratives
        ? handlers.narratives()
        : { running: [], themes: [], wallets: [], calibration: { rows: [], missed: 0 } };
    } else if (url.startsWith('/api/tracer')) {
      body = handlers.tracer ? handlers.tracer(url) : { status: 'done', nodes: [], edges: [] };
    }

    return {
      ok: true,
      json: async () => body,
    } as Response;
  });
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, Set<EventListener>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.(new Event('open'));
  }

  emitError() {
    this.onerror?.(new Event('error'));
  }

  emitUpdate(scopes: string[]) {
    const event = new MessageEvent('update', {
      data: JSON.stringify({ scopes }),
    });
    for (const listener of this.listeners.get('update') ?? []) {
      listener(event);
    }
  }
}

describe('Cheesequake UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('KIND_INFO defines plain-English explanations for all 7 alert kinds', () => {
    expect(Object.keys(KIND_INFO).sort()).toEqual([...EXPECTED_KINDS].sort());
    for (const kind of EXPECTED_KINDS) {
      expect(typeof KIND_INFO[kind]).toBe('string');
      expect(KIND_INFO[kind].trim().length).toBeGreaterThan(10);
    }
  });

  it('KindTooltip renders accessible tooltip for known kinds, handles unknown kinds, and is XSS-safe', () => {
    for (const kind of EXPECTED_KINDS) {
      const display = kind.replaceAll('_', ' ');
      const expectedLabel = display.charAt(0).toUpperCase() + display.slice(1);
      const { unmount } = render(<KindTooltip kind={kind} />);
      const btn = screen.getByRole('button', { name: `What ${expectedLabel} means` });
      expect(btn).toHaveAttribute('type', 'button');
      expect(screen.queryByRole('tooltip')).toBeNull();
      fireEvent.focus(btn);
      const tip = screen.getByRole('tooltip');
      expect(tip.textContent).toBe(KIND_INFO[kind]);
      expect(btn).toHaveAttribute('aria-describedby', tip.id);
      unmount();
    }

    const { rerender, container } = render(<KindTooltip kind="unknown_kind" />);
    expect(container.textContent).toBe('Unknown kind');
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<KindTooltip kind="toString" />);
    expect(container.textContent).toBe('ToString');
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<KindTooltip kind={null} />);
    expect(container.textContent).toBe('');

    const hostile = '<img src=x onerror=alert(1)>';
    rerender(<KindTooltip kind={hostile} />);
    expect(container.textContent).toBe(hostile);
    expect(container.querySelector('img')).toBeNull();
  });

  it('narratives glossary covers expected weights, bands, and unknown keys', () => {
    expect(Object.keys(PARTS).sort()).toEqual(
      ['deployer', 'health', 'liquidity', 'momentum', 'narrative', 'wallets'],
    );
    expect(Object.keys(BANDS).sort()).toEqual(['avoid', 'confirm', 'neutral', 'risk', 'strong']);
    for (const key of [
      'mint_authority',
      'freeze_authority',
      'rugged',
      'transfer_fee',
      'lp_unlocked',
      'top10',
      'insiders',
      'liquidity',
      'age',
      'wash',
      'inactive',
      'wallets',
      'health',
      'deployer',
      'momentum',
      'narrative',
    ]) {
      expect(UNKNOWNS[key]).toBeTruthy();
    }
    expect(explainPart('wallets', { part: 'wallets', points: 0, max: 30 }, [], null).level).toBe('None');
    expect(explainPart('wallets', { part: 'wallets', points: 0, max: 30 }, ['wallets'], null).level).toBe('No data');
    expect(explainPart('health', { part: 'health', points: 24, max: 25 }, [], null).level).toBe('Good');
    expect(explainPart('health', { part: 'health', points: 15, max: 25 }, [], null).level).toBe('OK');
    expect(explainPart('health', { part: 'health', points: 5, max: 25 }, [], null).level).toBe('Weak');
    expect(explainPart('liquidity', undefined, [], null).level).toBe('No data');
  });

  it('Watch and Ping alert tables render KindTooltip tooltips instead of raw kind strings', async () => {
    const mint = addr('M');
    const wallet = addr('W');
    const watchCoins = [
      {
        mint,
        symbol: 'BONK',
        name: 'Bonk',
        pool: addr('P'),
        status: 'flag',
        label: 'Red flag',
        score: 20,
        price_usd: 0.001,
        mcap_usd: 10000,
        liquidity_usd: 5000,
        reasons: ['Creator sold'],
        alerts: [
          { ts: 1700000000, kind: 'exit_deployer', mint, wallet, detail: { side: 'sell', usd: 500 } },
          { ts: 1700000060, kind: 'exit_divergence', mint, wallet: null, detail: { vol: 60000, buyers: 5 } },
        ],
      },
    ];
    const pingPayload = {
      alerts: [
        { ts: 1700000000, kind: 'buy', mint, symbol: 'BONK', wallet, detail: { usd: 250 } },
        { ts: 1700000030, kind: 'consensus', mint, symbol: 'BONK', wallet: null, detail: { wallets: [wallet], mcap: 50000 } },
      ],
      wallets: [{ address: wallet }],
    };
    globalThis.fetch = mockFetch({
      watch: () => ({ ok: true, coins: watchCoins }),
      ping: () => pingPayload,
    });

    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'What Exit deployer means' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'What Exit divergence means' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'What Buy means' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: 'What Consensus means' }).length).toBeGreaterThan(0);
    });
  });

  it('Narratives orders cards, caps themes, handles fallbacks, and preserves open rows on refresh', async () => {
    const mintA = addr('A');
    const mintB = addr('B');
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
      themes: Array.from({ length: 7 }, (_, i) => ({
        keyword: `word${i}`, aliases: [], tags: [], tokens: 3, volume: 1000 - i, share: 0.2, prevShare: null, newCoins: 0,
        leader: { mint: `L${i}`, symbol: `LEAD${i}`, vol_h1: 1 },
        members: [{ mint: `L${i}`, symbol: `MEM${i}`, name: null, vol_h1: 1, created_at: null }],
      })),
      wallets: [{ address: addr('W'), label: '', class: 'unrated', bought: 1, winRate: null, medianHoldSeconds: null, stillHoldingShare: null }],
      calibration: { rows: [], missed: 0 },
    };

    globalThis.fetch = mockFetch({ narratives: () => payload });
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Running now' })).toBeInTheDocument();
    });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Running now',
      'Themes this hour',
      'Best calls: wallet scorecard',
      'Calibration: later price by score band',
    ]);

    expect(screen.getAllByText('AAAA…1111').length).toBeGreaterThan(0);
    expect(screen.getAllByText('no theme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('easy to sell').length).toBeGreaterThan(0);

    // Themes capped at 5
    expect(screen.getByText('word4')).toBeInTheDocument();
    expect(screen.queryByText('word6')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 themes' }));
    expect(screen.getByText('word6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show top 5' })).toBeInTheDocument();

    // Theme row expands to members
    const row = screen.getByText('word0').closest('tr')!;
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('MEM0')).toBeInTheDocument();

    // Wallet fallbacks use em-dash + single note
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('— means not enough trades yet.')).toBeInTheDocument();

    // Explain score expand & preserve across refresh
    const explainBtns = screen.getAllByRole('button', { name: 'Explain score' });
    fireEvent.click(explainBtns[0]);
    expect(screen.getAllByRole('button', { name: 'Hide' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Missing data counts as 0 points and caps the score at 79.').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Hide' }).length).toBeGreaterThan(0);
      expect(screen.getByText('word6')).toBeInTheDocument();
    });
  });

  it('Watch tab renders hold badges, plain-English reasons, ping table, and preserves open chart iframe across refreshes', async () => {
    const mintSafe = addr('S');
    const mintFlag = addr('F');
    const poolSafe = addr('P');
    const mintNew = addr('N');
    const coins: WatchCoin[] = [
      {
        mint: mintSafe, symbol: 'GOOD', name: 'Good Coin', pool: poolSafe,
        status: 'safe', label: 'Safe to hold', score: 78, price_usd: 0.025, mcap_usd: 250000, liquidity_usd: 55000, vol_h24: 120000, image_url: null,
        reasons: ['Passed all safety checks with no recent exit alerts'],
        alerts: [{ ts: 1700000000, kind: 'consensus', mint: mintSafe, wallet: null, detail: { wallets: ['a', 'b', 'c'], mcap: 200000 } }],
      },
      {
        mint: mintFlag, symbol: 'RUG', name: 'Rug Coin', pool: null,
        status: 'flag', label: 'Red flag', score: 0, price_usd: 0.0001, mcap_usd: 1000, liquidity_usd: 500, vol_h24: null, image_url: null,
        reasons: ['Mint authority is still active (new tokens can be minted)'],
        alerts: [{ ts: 1700000100, kind: 'exit_deployer', mint: mintFlag, wallet: addr('D'), detail: { side: 'sell' } }],
      },
    ];
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = mockFetch({
      watch: () => ({ ok: true, coins }),
      onCall: (url, method) => {
        calls.push({ url, method });
        if (url.startsWith('/api/watch') && method === 'POST') {
          coins.push({
            mint: mintNew, symbol: null, name: null, pool: null,
            status: 'caution', label: 'Caution', score: null, price_usd: null, mcap_usd: null, liquidity_usd: null, vol_h24: null, image_url: null,
            reasons: ['Waiting for first safety scan'], alerts: [],
          });
        }
      },
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));

    await waitFor(() => {
      expect(screen.getByText('Safe to hold')).toBeInTheDocument();
      expect(screen.getByText('Red flag')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Score').length).toBeGreaterThan(0);
    expect(screen.getAllByText('78/100').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mint authority is still active/).length).toBeGreaterThan(0);
    expect(screen.getByText('creator sell')).toBeInTheDocument();
    expect(document.querySelectorAll('iframe').length).toBe(0);

    const chartBtns = screen.getAllByRole('button', { name: 'Show chart' });
    fireEvent.click(chartBtns[0]);
    const iframeBefore = document.querySelector('iframe')!;
    expect(iframeBefore).toBeTruthy();
    expect(iframeBefore.getAttribute('src')).toContain(`https://dexscreener.com/solana/${poolSafe}?embed=1`);

    // Refresh preserves exact same iframe DOM element
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => {
      const iframeAfter = document.querySelector('iframe');
      expect(iframeAfter).toBe(iframeBefore);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hide chart' }));
    await waitFor(() => {
      expect(document.querySelector('iframe')).toBeNull();
    });

    // Invalid mint validation
    const input = screen.getByLabelText('Coin mint address');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Watch coin' }));
    expect(screen.getByText(/not a valid Solana mint address/)).toBeInTheDocument();

    // Valid mint POST
    fireEvent.change(input, { target: { value: mintNew } });
    fireEvent.click(screen.getByRole('button', { name: 'Watch coin' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.url.includes(mintNew))).toBe(true);
      expect(screen.getAllByText(/Waiting for first safety scan/).length).toBeGreaterThan(0);
    });
  });

  it('Narratives hydrates watchedSet before visiting Watch and unwatches on click', async () => {
    const mintWatched = addr('W');
    let coins = [
      {
        mint: mintWatched, symbol: 'WTC', name: 'Watched Coin', pool: addr('P'),
        status: 'safe', label: 'Safe to hold', score: 80, price_usd: 0.1, mcap_usd: 100000, liquidity_usd: 50000,
        reasons: ['Passed all safety checks'], alerts: [],
      },
    ];
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = mockFetch({
      watch: () => ({ ok: true, coins }),
      narratives: () => ({
        running: [{ mint: mintWatched, symbol: 'WTC', theme: null, score: 80, band: 'strong', mcap_usd: 100000, reasons: [], unknowns: [] }],
        themes: [],
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
      onCall: (url, method) => {
        calls.push({ url, method });
        if (url.startsWith('/api/watch') && method === 'DELETE') {
          coins = [];
        }
      },
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));

    const hideToggle = await screen.findByLabelText('Hide watched');
    expect(hideToggle).toBeChecked();
    fireEvent.click(hideToggle);

    const watchingBtns = await screen.findAllByRole('button', { name: 'Watching' });
    expect(watchingBtns[0]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(watchingBtns[0]);
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'DELETE' && c.url.includes(mintWatched))).toBe(true);
      const watchBtns = screen.getAllByRole('button', { name: 'Watch' });
      expect(watchBtns[0]).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('Ping and Watch tabs render registered wallet names, consensus wallet names, and filter by wallet + kind', async () => {
    const mint = addr('M');
    const wAlice = addr('A');
    const wBob = addr('B');
    const wUnlabeled = addr('U');
    const wallets = [
      { address: wAlice, label: 'alice' },
      { address: wBob, label: 'bob' },
      { address: wUnlabeled, label: null },
    ];
    const allAlerts = [
      { ts: 1700000000, kind: 'buy', mint, symbol: 'PEPE', wallet: wAlice, wallet_label: 'alice', detail: { usd: 450 } },
      { ts: 1700000050, kind: 'consensus', mint, symbol: 'PEPE', wallet: null, wallet_label: null, detail: { wallets: [wAlice, wBob, wUnlabeled], wallet_labels: { [wAlice]: 'alice', [wBob]: 'bob' }, mcap: 120000 } },
      { ts: 1700000100, kind: 'sell', mint, symbol: 'PEPE', wallet: wUnlabeled, wallet_label: null, detail: { usd: 100 } },
    ];
    const calls: string[] = [];
    globalThis.fetch = mockFetch({
      watch: () => ({
        ok: true,
        coins: [{
          mint, symbol: 'PEPE', name: 'Pepe', pool: addr('P'),
          status: 'safe', label: 'Safe to hold', score: 82, price_usd: 0.01, mcap_usd: 120000, liquidity_usd: 40000,
          reasons: ['Passed all safety checks'],
          alerts: allAlerts,
        }],
      }),
      ping: (url) => {
        const u = new URL(url, 'http://127.0.0.1');
        const kind = u.searchParams.get('kind') || '';
        const w = u.searchParams.get('wallet') || '';
        const alerts = allAlerts.filter((a) => (!kind || a.kind === kind) && (!w || a.wallet === w || (a.kind === 'consensus' && a.detail.wallets?.includes(w))));
        return { alerts, wallets };
      },
      onCall: (url) => calls.push(url),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));

    const walletSelect = await screen.findByLabelText('Wallet');
    const kindSelect = screen.getByLabelText('Alert kind');

    await waitFor(() => {
      const opts = within(walletSelect).getAllByRole('option').map((o) => o.textContent);
      expect(opts).toEqual(['all wallets', 'alice (AAAA…1111)', 'bob (BBBB…1111)', 'UUUU…1111']);
    });

    expect(document.body.textContent).toContain('alice AAAA…1111');
    expect(document.body.textContent).toContain('alice AAAA…1111, bob BBBB…1111, UUUU…1111');

    fireEvent.change(walletSelect, { target: { value: wAlice } });
    await waitFor(() => {
      expect(calls.some((u) => u === `/api/ping?wallet=${wAlice}`)).toBe(true);
      expect(document.querySelectorAll('tbody tr').length).toBe(2);
    });

    fireEvent.change(kindSelect, { target: { value: 'buy' } });
    await waitFor(() => {
      expect(calls.some((u) => u === `/api/ping?kind=buy&wallet=${wAlice}`)).toBe(true);
      expect(document.querySelectorAll('tbody tr').length).toBe(1);
    });

    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    await waitFor(() => {
      expect(document.body.textContent).toContain('alice AAAA…1111, bob BBBB…1111, UUUU…1111');
    });
  });

  it('Market renders Trench Index KPI and interactive SVG chart; Tracer inspects nodes', async () => {
    const startW = addr('T');
    const destW = addr('E');
    globalThis.fetch = mockFetch({
      market: {
        index: { value: 64, zone: 'Hot' },
        hours: 200,
        warmupHours: 168,
        hourly: [
          { hour: 1700000000, index_value: 45 },
          { hour: 1700003600, index_value: 64 },
        ],
      },
      tracer: () => ({
        status: 'done',
        nodes: [
          { address: startW, depth: 0, label: null, type: null },
          { address: destW, depth: 1, label: 'Binance', type: 'exchange' },
        ],
        edges: [{ from: startW, to: destW, usd: 12500 }],
      }),
    });

    render(<App />);
    await waitFor(() => {
      const kpi = screen.getByText('64');
      expect(kpi).toHaveClass('text-3xl');
      expect(screen.getByRole('img', { name: 'Trench index, last 30 days' })).toBeInTheDocument();
      expect(screen.getByText('Euphoria')).toBeInTheDocument();
      expect(screen.getByText('Cold')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Tracer/i }));
    const input = screen.getByLabelText('Start wallet address');
    fireEvent.change(input, { target: { value: startW } });
    fireEvent.click(screen.getByRole('button', { name: 'Trace' }));

    const binanceNode = await screen.findByRole('button', { name: 'Binance' });
    fireEvent.click(binanceNode);
    expect(screen.getByText(/Incoming transfers: 1/)).toBeInTheDocument();
  });

  it('applies glass-input, glass-select, and unified min-h-[44px] px-3.5 py-2 button classes across Watch, Tracer, and Ping', async () => {
    const mint = addr('M');
    const wallet = addr('W');
    globalThis.fetch = mockFetch({
      watch: () => ({
        ok: true,
        coins: [
          {
            mint,
            symbol: 'GLSS',
            name: 'Glass',
            pool: addr('P'),
            status: 'safe',
            label: 'Safe to hold',
            score: 85,
            price_usd: 0.05,
            mcap_usd: 100000,
            liquidity_usd: 50000,
            reasons: ['All good'],
            alerts: [],
          },
        ],
      }),
      ping: () => ({
        alerts: [
          { ts: 1700000000, kind: 'buy', mint, symbol: 'GLSS', wallet, detail: { usd: 100 } },
        ],
        wallets: [{ address: wallet, label: 'alpha' }],
      }),
    });

    render(<App />);

    // Watch tab: mint input + Show chart / Hide chart + Unwatch
    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    const showChartBtn = await screen.findByRole('button', { name: 'Show chart' });
    expect(showChartBtn).toHaveClass('min-h-[44px]', 'px-3.5', 'py-2');
    fireEvent.click(showChartBtn);
    const hideChartBtn = screen.getByRole('button', { name: 'Hide chart' });
    expect(hideChartBtn).toHaveClass('min-h-[44px]', 'px-3.5', 'py-2');
    const unwatchBtn = screen.getByRole('button', { name: 'Unwatch' });
    expect(unwatchBtn).toHaveClass('min-h-[44px]', 'px-3.5', 'py-2');
    const mintInput = screen.getByLabelText('Coin mint address');
    expect(mintInput).toHaveClass('glass-input', 'min-h-[44px]');

    // Ping tab: selects + WatchButton
    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    const kindSelect = await screen.findByLabelText('Alert kind');
    const walletSelect = screen.getByLabelText('Wallet');
    expect(kindSelect).toHaveClass('glass-input', 'glass-select', 'min-h-[44px]');
    expect(walletSelect).toHaveClass('glass-input', 'glass-select', 'min-h-[44px]');
    const watchBtns = await screen.findAllByRole('button', { name: 'Watching' });
    expect(watchBtns[0]).toHaveClass('min-h-[44px]', 'px-3.5', 'py-2');

    // Tracer tab: start wallet input
    fireEvent.click(screen.getByRole('tab', { name: /Tracer/i }));
    const tracerInput = screen.getByLabelText('Start wallet address');
    expect(tracerInput).toHaveClass('glass-input', 'min-h-[44px]');
  });

  it('WatchCard renders 5 equal-width metric cards including 24h Volume and token image with monogram fallback', async () => {
    const coins: WatchCoin[] = [
      {
        mint: addr('A'),
        symbol: 'GOOD',
        name: 'Good Coin',
        pool: addr('P'),
        status: 'safe',
        label: 'Safe to hold',
        score: 88,
        price_usd: 0.05,
        mcap_usd: 500000,
        liquidity_usd: 75000,
        vol_h24: 123456,
        image_url: 'https://cdn.example/good.png',
        reasons: ['Passed all safety checks'],
        alerts: [],
      },
      {
        mint: addr('B'),
        symbol: 'NOIMG',
        name: 'No Image Coin',
        pool: null,
        status: 'caution',
        label: 'Caution',
        score: 50,
        price_usd: 0.01,
        mcap_usd: 10000,
        liquidity_usd: 5000,
        vol_h24: null,
        image_url: null,
        reasons: ['Missing safety or market data'],
        alerts: [],
      },
    ];
    globalThis.fetch = mockFetch({
      watch: () => ({ ok: true, coins }),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));

    await waitFor(() => {
      expect(screen.getByText('GOOD (Good Coin)')).toBeInTheDocument();
      expect(screen.getByText('NOIMG (No Image Coin)')).toBeInTheDocument();
    });

    // 5 equal-width stat cards per WatchCard
    const grids = document.querySelectorAll('.lg\\:grid-cols-5');
    expect(grids.length).toBe(2);
    expect(grids[0].children.length).toBe(5);
    expect(screen.getAllByText('Score').length).toBe(2);
    expect(screen.getAllByText('Price').length).toBe(2);
    expect(screen.getAllByText('Market cap').length).toBe(2);
    expect(screen.getAllByText('Liquidity').length).toBe(2);
    expect(screen.getAllByText('24h Volume').length).toBe(2);
    expect(screen.getByText('$123,456')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();

    // Token image and monogram fallback
    const img = screen.getByRole('img', { name: 'GOOD' });
    expect(img).toHaveAttribute('src', 'https://cdn.example/good.png');
    expect(screen.getByText('NO')).toBeInTheDocument();

    // Error event on image falls back to monogram
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'GOOD' })).not.toBeInTheDocument();
    expect(screen.getByText('GO')).toBeInTheDocument();
  });

  it('Narratives and Ping render TokenAvatar images and monogram fallbacks', async () => {
    const mImg = addr('I');
    const mFallback = addr('F');
    globalThis.fetch = mockFetch({
      narratives: () => ({
        themes: [],
        running: [
          {
            mint: mImg,
            symbol: 'IMG',
            name: 'Image Coin',
            image_url: 'https://cdn.example/img.png',
            theme: null,
            score: 80,
            band: 'strong',
            mcap_usd: 100000,
            reasons: [],
            unknowns: [],
          },
          {
            mint: mFallback,
            symbol: 'FBK',
            name: 'Fallback Coin',
            image_url: null,
            theme: null,
            score: 60,
            band: 'watch',
            mcap_usd: 50000,
            reasons: [],
            unknowns: [],
          },
        ],
        wallets: [],
        calibration: { rows: [], total: 0, pending: 0, missed: 0 },
      }),
      ping: () => ({
        alerts: [
          {
            ts: 1700000000,
            kind: 'buy',
            mint: mImg,
            wallet: addr('W'),
            symbol: 'IMG',
            image_url: 'https://cdn.example/img.png',
            detail: { usd: 500 },
          },
          {
            ts: 1700000010,
            kind: 'buy',
            mint: mFallback,
            wallet: addr('W'),
            symbol: 'FBK',
            image_url: null,
            detail: { usd: 250 },
          },
        ],
        wallets: [],
      }),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('img', { name: 'IMG' }).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('FB').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('img', { name: 'IMG' }).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('FB').length).toBeGreaterThanOrEqual(1);
  });

  it('PingToaster silently hydrates historical alerts, toasts new >$100 alerts, deduplicates, and navigates to Ping on click', async () => {
    const m1 = addr('A');
    const m2 = addr('B');
    const m3 = addr('C');
    const w1 = addr('W');
    let poll = 0;

    globalThis.fetch = mockFetch({
      ping: () => {
        if (poll === 0) {
          return {
            alerts: [
              {
                ts: 1700000100,
                kind: 'buy',
                mint: m1,
                wallet: w1,
                wallet_label: 'Whale 1',
                symbol: 'HIST',
                detail: { usd: 250 },
              },
            ],
            wallets: [],
          };
        }
        if (poll === 1) {
          return {
            alerts: [
              {
                ts: 1700000100,
                kind: 'buy',
                mint: m1,
                wallet: w1,
                wallet_label: 'Whale 1',
                symbol: 'HIST',
                detail: { usd: 250 },
              },
              {
                ts: 1700000200,
                kind: 'buy',
                mint: m2,
                wallet: w1,
                wallet_label: 'Whale 1',
                symbol: 'ALPHA',
                detail: { usd: 101 },
              },
              {
                ts: 1700000201,
                kind: 'exit_deployer',
                mint: m3,
                wallet: null,
                symbol: 'EXIT',
                detail: { side: 'sell', usd: 500 },
              },
              {
                ts: 1700000202,
                kind: 'buy',
                mint: m1,
                wallet: w1,
                symbol: 'EXACT',
                detail: { usd: 100 },
              },
              {
                ts: 1700000203,
                kind: 'sell',
                mint: m1,
                wallet: w1,
                symbol: 'SMALL',
                detail: { usd: 45 },
              },
              {
                ts: 1700000204,
                kind: 'consensus',
                mint: m1,
                wallet: null,
                symbol: 'CONS',
                detail: { wallets: [w1], mcap: 50000 },
              },
            ],
            wallets: [],
          };
        }
        return {
          alerts: [
            {
              ts: 1700000100,
              kind: 'buy',
              mint: m1,
              wallet: w1,
              wallet_label: 'Whale 1',
              symbol: 'HIST',
              detail: { usd: 250 },
            },
            {
              ts: 1700000200,
              kind: 'buy',
              mint: m2,
              wallet: w1,
              wallet_label: 'Whale 1',
              symbol: 'ALPHA',
              detail: { usd: 101 },
            },
          ],
          wallets: [],
        };
      },
    });

    render(<App />);

    // Initial hydration: historical $250 alert must not produce a toast
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/ping');
    });
    expect(screen.queryByRole('status')).toBeNull();

    // Trigger next poll via Refresh button
    poll = 1;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));

    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(2);
    });
    const toaster = screen.getByLabelText('Ping notifications');
    expect(within(toaster).getByText('ALPHA')).toBeInTheDocument();
    expect(within(toaster).getByText('$101')).toBeInTheDocument();
    expect(within(toaster).getByText('EXIT')).toBeInTheDocument();
    expect(within(toaster).getByText('$500')).toBeInTheDocument();
    expect(within(toaster).queryByText('EXACT')).toBeNull();
    expect(within(toaster).queryByText('SMALL')).toBeNull();
    expect(within(toaster).queryByText('CONS')).toBeNull();
    expect(within(toaster).queryByText('HIST')).toBeNull();

    // Dismiss one toast with close button without changing tabs
    const dismissButtons = within(toaster).getAllByRole('button', {
      name: 'Dismiss notification',
    });
    fireEvent.click(dismissButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(1);
    });
    expect(screen.getByRole('tab', { name: /Market/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Click remaining toast to navigate to Ping tab and dismiss it
    fireEvent.click(within(toaster).getByText('EXIT'));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Ping/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.queryByRole('status')).toBeNull();
    });

    // Repeated poll with already-seen alerts does not duplicate toasts
    poll = 2;
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh now' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/ping');
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('PingToaster toasts unseen >$100 alerts from the last 5 minutes on initial load and deduplicates across remounts via sessionStorage', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const m1 = addr('E');
    const m2 = addr('F');
    const m3 = addr('G');
    const w1 = addr('W');

    globalThis.fetch = mockFetch({
      ping: () => ({
        alerts: [
          {
            ts: nowSec - 60,
            kind: 'buy',
            mint: m1,
            wallet: w1,
            wallet_label: 'Whale 1',
            symbol: 'RECENT',
            detail: { usd: 250 },
          },
          {
            ts: nowSec - 301,
            kind: 'buy',
            mint: m2,
            wallet: w1,
            wallet_label: 'Whale 1',
            symbol: 'STALE',
            detail: { usd: 400 },
          },
          {
            ts: nowSec - 30,
            kind: 'buy',
            mint: m3,
            wallet: w1,
            symbol: 'SMALLRECENT',
            detail: { usd: 100 },
          },
        ],
        wallets: [],
      }),
    });

    const firstRender = render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(1);
    });
    const toaster = screen.getByLabelText('Ping notifications');
    expect(within(toaster).getByText('RECENT')).toBeInTheDocument();
    expect(within(toaster).getByText('$250')).toBeInTheDocument();
    expect(within(toaster).queryByText('STALE')).toBeNull();
    expect(within(toaster).queryByText('SMALLRECENT')).toBeNull();

    // Dismiss the toast, unmount, and remount: sessionStorage prevents re-toasting
    fireEvent.click(within(toaster).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    firstRender.unmount();

    render(<App />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/ping');
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('PingToaster auto-dismisses toasts after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const m1 = addr('D');
      let poll = 0;

      globalThis.fetch = mockFetch({
        ping: () =>
          poll === 0
            ? { alerts: [], wallets: [] }
            : {
                alerts: [
                  {
                    ts: 1700000300,
                    kind: 'exit_wallet',
                    mint: m1,
                    wallet: addr('W'),
                    symbol: 'AUTO',
                    detail: { usd: 320 },
                  },
                ],
                wallets: [],
              },
      });

      render(<App />);
      await act(async () => {
        await Promise.resolve();
      });

      poll = 1;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(screen.getByText('AUTO')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(29000);
      });
      expect(screen.getByText('AUTO')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(screen.queryByText('AUTO')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      cleanup();
      await vi.advanceTimersByTimeAsync(200);
      vi.useRealTimers();
    }
  });

  it('Layout renders the Telemetry Badge Logo beside the Cheesequake heading and disclaimer', () => {
    render(
      <Layout
        activeTab="market"
        onTabChange={() => {}}
        lastUpdated={null}
        refreshing={false}
        onRefresh={() => {}}
      >
        <div>content</div>
      </Layout>,
    );

    const logo = screen.getByTestId('cheesequake-logo');
    expect(logo.tagName.toLowerCase()).toBe('svg');
    expect(logo).toHaveAttribute('width', '36');
    expect(logo).toHaveAttribute('height', '36');
    expect(logo).toHaveAttribute('aria-hidden', 'true');
    expect(logo).toHaveAttribute('viewBox', '0 0 64 64');

    expect(screen.getByRole('heading', { name: 'Cheesequake' })).toBeInTheDocument();
    expect(screen.getByText(/Research tool\. Not trading advice\./)).toBeInTheDocument();
  });

  it('PingToaster renders narrative toasts for strong, confirm, and neutral bands, ignores risk/avoid, deduplicates across refreshes, and navigates to Narratives on click', async () => {
    const mStrong = addr('S');
    const mConfirm = addr('C');
    const mNeutral = addr('N');
    const mRisk = addr('R');
    const mAvoid = addr('V');

    const makeCoin = (
      mint: string,
      symbol: string | null,
      band: string,
      score: number,
    ) => ({
      mint,
      symbol,
      name: symbol || 'Unnamed',
      theme: 'ai-agents',
      score,
      band,
      mcap_usd: 150000,
      unknowns: [],
      reasons: [],
    });

    globalThis.fetch = mockFetch({
      narratives: () => ({
        themes: [],
        running: [
          makeCoin(mStrong, 'STRG', 'strong', 88),
          makeCoin(mConfirm, 'PRMS', 'confirm', 72),
          makeCoin(mNeutral, null, 'neutral', 54),
          makeCoin(mRisk, 'RISKY', 'risk', 35),
          makeCoin(mAvoid, 'AVOID', 'avoid', 12),
        ],
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByRole('status')).toHaveLength(3);
    });

    const toaster = screen.getByLabelText('Ping notifications');
    expect(within(toaster).getByText('Strong')).toBeInTheDocument();
    expect(within(toaster).getByText('STRG')).toBeInTheDocument();
    expect(within(toaster).getByText('88/100')).toBeInTheDocument();

    expect(within(toaster).getByText('Promising')).toBeInTheDocument();
    expect(within(toaster).getByText('PRMS')).toBeInTheDocument();
    expect(within(toaster).getByText('72/100')).toBeInTheDocument();

    expect(within(toaster).getByText('Mixed')).toBeInTheDocument();
    expect(within(toaster).getByText(`${mNeutral.slice(0, 4)}…${mNeutral.slice(-4)}`)).toBeInTheDocument();
    expect(within(toaster).getByText('54/100')).toBeInTheDocument();

    expect(within(toaster).queryByText('RISKY')).toBeNull();
    expect(within(toaster).queryByText('AVOID')).toBeNull();

    // Dismiss the first toast without changing tabs
    const dismissButtons = within(toaster).getAllByRole('button', {
      name: 'Dismiss notification',
    });
    fireEvent.click(dismissButtons[0]);
    await waitFor(() => {
      expect(within(toaster).getAllByRole('status')).toHaveLength(2);
      expect(within(toaster).queryByText('STRG')).toBeNull();
    });
    expect(screen.getByRole('tab', { name: /Market/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Repeated refresh with the same coins does not duplicate toasts
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh now' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/narratives');
    });
    expect(within(toaster).getAllByRole('status')).toHaveLength(2);
    expect(within(toaster).queryByText('STRG')).toBeNull();

    // Clicking a narrative toast switches to Narratives tab and dismisses it
    fireEvent.click(within(toaster).getByText('PRMS'));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Narratives/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(within(toaster).getAllByRole('status')).toHaveLength(1);
      expect(within(toaster).queryByText('PRMS')).toBeNull();
    });
  });

  it('persists Ping filters, Watch inputs/charts, Narratives toggles, and Tracer graph selection across tab switches', async () => {
    const walletA = addr('W');
    const walletB = addr('X');
    const mintWatch = addr('M');
    const mintNar = addr('N');
    const pingCalls: string[] = [];

    globalThis.fetch = mockFetch({
      watch: () => ({
        ok: true,
        coins: [
          {
            mint: mintWatch,
            symbol: 'WTC',
            name: 'Watch Coin',
            pool: addr('P'),
            status: 'safe',
            label: 'Safe to hold',
            score: 80,
            price_usd: 0.01,
            mcap_usd: 50000,
            liquidity_usd: 20000,
            vol_h24: 10000,
            image_url: null,
            reasons: ['Safe'],
            alerts: [],
          },
        ],
      }),
      ping: (url) => {
        pingCalls.push(url);
        return {
          alerts: [
            {
              ts: 1700000000,
              kind: 'buy',
              mint: mintWatch,
              symbol: 'WTC',
              wallet: walletA,
              wallet_label: 'alice',
              detail: { usd: 200 },
            },
          ],
          wallets: [{ address: walletA, label: 'alice' }],
        };
      },
      narratives: () => ({
        running: [
          {
            mint: mintNar,
            symbol: 'NRT',
            theme: 'ai',
            score: 75,
            band: 'confirm',
            mcap_usd: 80000,
            reasons: [{ part: 'health', points: 20, max: 25 }],
            unknowns: [],
          },
        ],
        themes: Array.from({ length: 7 }, (_, i) => ({
          keyword: `theme${i}`,
          aliases: [], tags: [], prevShare: null, newCoins: 0, leader: { mint: 'L', symbol: 'L', vol_h1: 1 }, members: [],
                    tokens: 2,
          volume: 1000 - i,
          share: 0.15,
        })),
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
      tracer: () => ({
        status: 'done',
        nodes: [
          { address: walletA, label: 'Start', depth: 0, type: 'other' },
          { address: walletB, label: 'Binance', depth: 1, type: 'exchange' },
        ],
        edges: [{ from: walletA, to: walletB, usd: 500 }],
      }),
    });

    render(<App />);

    // 1. Ping -> Market -> Ping preserves kind and wallet filters and re-fetches with saved params
    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Alert kind')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Alert kind'), { target: { value: 'buy' } });
    fireEvent.change(screen.getByLabelText('Wallet'), { target: { value: walletA } });
    await waitFor(() => {
      expect(pingCalls.some((u) => u.includes('kind=buy') && u.includes(`wallet=${walletA}`))).toBe(true);
    });

    pingCalls.length = 0;
    fireEvent.click(screen.getByRole('tab', { name: /Market/i }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Market/i })).toHaveAttribute('aria-selected', 'true');
    });
    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Alert kind')).toHaveValue('buy');
      expect(screen.getByLabelText('Wallet')).toHaveValue(walletA);
      expect(pingCalls.some((u) => u.includes('kind=buy') && u.includes(`wallet=${walletA}`))).toBe(true);
    });

    // 2. Watch -> Market -> Watch preserves mintInput and per-mint chartOpen
    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show chart' })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Coin mint address'), {
      target: { value: 'draft-mint' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show chart' }));
    const watchIframe = document.querySelector('iframe');
    expect(watchIframe).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Market/i }));
    // Watch stays mounted (hidden) so the chart iframe does not reload across tab switches
    expect(document.querySelector('iframe')).toBe(watchIframe);
    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Coin mint address')).toHaveValue('draft-mint');
      expect(screen.getByRole('button', { name: 'Hide chart' })).toBeInTheDocument();
      expect(document.querySelector('iframe')).toBe(watchIframe);
    });

    // 3. Narratives -> Market -> Narratives preserves openMints and showAllThemes
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show all 7 themes' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 themes' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Explain score' })[0]);
    expect(screen.getByText('theme6')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Hide' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /Market/i }));
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    await waitFor(() => {
      expect(screen.getByText('theme6')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show top 5' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Hide' }).length).toBeGreaterThan(0);
    });

    // 4. Tracer -> Watch -> Tracer restores input, traceWallet, and selectedAddress
    fireEvent.click(screen.getByRole('tab', { name: /Tracer/i }));
    fireEvent.change(screen.getByLabelText('Start wallet address'), {
      target: { value: walletA },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trace' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Binance' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Binance' }));
    expect(screen.getByText('Hop 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    fireEvent.click(screen.getByRole('tab', { name: /Tracer/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Start wallet address')).toHaveValue(walletA);
      expect(screen.getByText('Hop 1')).toBeInTheDocument();
    });
  });

  it('restores activeTab and per-tab state across App unmount/remount', async () => {
    const wallet = addr('T');
    globalThis.fetch = mockFetch({
      ping: () => ({
        alerts: [],
        wallets: [{ address: wallet, label: 'trader' }],
      }),
    });

    const firstRender = render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Alert kind')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Alert kind'), { target: { value: 'sell' } });
    fireEvent.change(screen.getByLabelText('Wallet'), { target: { value: wallet } });

    firstRender.unmount();

    render(<App />);
    expect(screen.getByRole('tab', { name: /Ping/i })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(screen.getByLabelText('Alert kind')).toHaveValue('sell');
      expect(screen.getByLabelText('Wallet')).toHaveValue(wallet);
    });
  });

  it('falls back to market and defaults when localStorage contains corrupt JSON or invalid values', async () => {
    window.localStorage.setItem('cheesequake:tab-state:active-tab', '"not-a-tab"');
    window.localStorage.setItem('cheesequake:tab-state:ping:kind', '{broken-json');
    window.localStorage.setItem('cheesequake:tab-state:narratives:open-mints', '12345');
    window.localStorage.setItem('cheesequake:tab-state:narratives:show-all-themes', '"yes"');

    globalThis.fetch = mockFetch({
      narratives: () => ({
        running: [],
        themes: Array.from({ length: 6 }, (_, i) => ({
          keyword: `kw${i}`,
          aliases: [], tags: [], prevShare: null, newCoins: 0, leader: { mint: 'L', symbol: 'L', vol_h1: 1 }, members: [],
                    tokens: 1,
          volume: 100,
          share: 0.1,
        })),
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
    });

    render(<App />);

    expect(screen.getByRole('tab', { name: /Market/i })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Alert kind')).toHaveValue('');
    });

    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show all 6 themes' })).toBeInTheDocument();
    });
  });

  it('Layout renders Live, Reconnecting, and omitted liveStatus indicators', () => {
    const { rerender } = render(
      <Layout
        activeTab="market"
        onTabChange={() => {}}
        lastUpdated={null}
        refreshing={false}
        onRefresh={() => {}}
        liveStatus="live"
      >
        <div>Body</div>
      </Layout>,
    );

    expect(screen.getByLabelText('Live updates connected')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();

    rerender(
      <Layout
        activeTab="market"
        onTabChange={() => {}}
        lastUpdated={null}
        refreshing={false}
        onRefresh={() => {}}
        liveStatus="reconnecting"
      >
        <div>Body</div>
      </Layout>,
    );

    expect(screen.getByLabelText('Reconnecting live updates')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();

    rerender(
      <Layout
        activeTab="market"
        onTabChange={() => {}}
        lastUpdated={null}
        refreshing={false}
        onRefresh={() => {}}
      >
        <div>Body</div>
      </Layout>,
    );

    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText('Reconnecting')).toBeNull();
  });

  it('App subscribes to /api/events and performs scoped refresh without re-fetching unrelated domains', async () => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    const calls: string[] = [];
    globalThis.fetch = mockFetch({
      onCall: (url) => {
        calls.push(url);
      },
    });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(calls.some((u) => u.startsWith('/api/market'))).toBe(true);
      expect(calls.some((u) => u.startsWith('/api/ping'))).toBe(true);
    });

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe('/api/events');

    act(() => {
      es.emitOpen();
    });
    expect(screen.getByLabelText('Live updates connected')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();

    calls.length = 0;
    act(() => {
      es.emitUpdate(['ping']);
    });

    await waitFor(() => {
      expect(calls.filter((u) => u.startsWith('/api/ping'))).toHaveLength(1);
    });
    expect(calls.filter((u) => u.startsWith('/api/market'))).toHaveLength(0);
    expect(calls.filter((u) => u.startsWith('/api/narratives'))).toHaveLength(0);
    expect(screen.getByText(/Updated /)).toBeInTheDocument();

    unmount();
    expect(es.closed).toBe(true);
  });

  it('App skips 60s fallback polling while live and polls all domains after EventSource error', async () => {
    MockEventSource.instances = [];
    vi.useFakeTimers();
    try {
      vi.stubGlobal('EventSource', MockEventSource);
      const calls: string[] = [];
      globalThis.fetch = mockFetch({
        onCall: (url) => {
          calls.push(url);
        },
      });

      render(<App />);
      await act(async () => {
        await Promise.resolve();
      });

      const es = MockEventSource.instances[0];
      act(() => {
        es.emitOpen();
      });
      expect(screen.getByText('Live')).toBeInTheDocument();

      calls.length = 0;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(calls).toHaveLength(0);

      act(() => {
        es.emitError();
      });
      expect(screen.getByLabelText('Reconnecting live updates')).toBeInTheDocument();
      expect(screen.getByText('Reconnecting')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(calls.some((u) => u.startsWith('/api/market'))).toBe(true);
      expect(calls.some((u) => u.startsWith('/api/ping'))).toBe(true);
      expect(calls.some((u) => u.startsWith('/api/narratives'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CTA and action buttons render aria-hidden icons, preserve accessible names, and keep stable toggle layout classes', async () => {
    const assertIconAndLayout = (
      btn: HTMLElement,
      requiredClasses: string[],
    ) => {
      const svg = btn.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      for (const cls of requiredClasses) {
        expect(btn.className).toContain(cls);
      }
    };

    // 1. WatchButton (Watch <-> Watching)
    const mint = addr('M');
    const onToggle = vi.fn();
    const { rerender, unmount } = render(
      <WatchButton mint={mint} watched={false} onToggle={onToggle} />,
    );
    const watchBtn = screen.getByRole('button', { name: 'Watch' });
    assertIconAndLayout(watchBtn, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
      'min-w-[100px]',
    ]);
    rerender(<WatchButton mint={mint} watched={true} onToggle={onToggle} />);
    const watchingBtn = screen.getByRole('button', { name: 'Watching' });
    assertIconAndLayout(watchingBtn, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
      'min-w-[100px]',
    ]);
    unmount();

    // 2. App-level CTAs across Narratives, Watch, and Tracer
    const themes = Array.from({ length: 6 }, (_, i) => ({
      keyword: `theme${i + 1}`,
      aliases: [], tags: [], prevShare: null, newCoins: 0, leader: { mint: 'L', symbol: 'L', vol_h1: 1 }, members: [],
      tokens: 10 - i,
      volume: 100000,
      share: 0.2,
    }));
    const watchCoin: WatchCoin = {
      mint,
      symbol: 'TST',
      name: 'TestCoin',
      pool: null,
      status: 'safe',
      score: 80,
      price_usd: 0.001,
      mcap_usd: 50000,
      liquidity_usd: 10000,
      vol_h24: 25000,
      image_url: null,
      reasons: ['Healthy flow'],
      alerts: [],
    };
    globalThis.fetch = mockFetch({
      narratives: () => ({
        running: [
          {
            mint,
            name: 'TestCoin',
            symbol: 'TST',
            theme: 'theme1',
            score: 80,
            band: 'strong',
            mcap_usd: 50000,
            unknowns: [],
            reasons: [{ part: 'flow', points: 20, max: 25 }],
          },
        ],
        themes,
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
      watch: () => ({ ok: true, coins: [watchCoin] }),
    });

    render(<App />);

    // Narratives tab
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    fireEvent.click(await screen.findByLabelText('Hide watched'));
    const explainBtns = await screen.findAllByRole('button', {
      name: 'Explain score',
    });
    expect(explainBtns.length).toBeGreaterThanOrEqual(2);
    for (const btn of explainBtns) {
      assertIconAndLayout(btn, [
        'inline-flex',
        'whitespace-nowrap',
        'shrink-0',
        'min-w-[124px]',
      ]);
    }
    fireEvent.click(explainBtns[0]);
    const hideBtns = screen.getAllByRole('button', { name: 'Hide' });
    for (const btn of hideBtns) {
      assertIconAndLayout(btn, [
        'inline-flex',
        'whitespace-nowrap',
        'shrink-0',
        'min-w-[124px]',
      ]);
    }

    const showAllThemesBtn = screen.getByRole('button', {
      name: 'Show all 6 themes',
    });
    assertIconAndLayout(showAllThemesBtn, ['inline-flex']);
    fireEvent.click(showAllThemesBtn);
    const showTop5Btn = screen.getByRole('button', { name: 'Show top 5' });
    assertIconAndLayout(showTop5Btn, ['inline-flex']);

    // Watch tab
    fireEvent.click(screen.getByRole('tab', { name: /Watch/i }));
    const watchCoinSubmit = await screen.findByRole('button', {
      name: 'Watch coin',
    });
    assertIconAndLayout(watchCoinSubmit, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
    ]);

    const showChartBtn = await screen.findByRole('button', {
      name: 'Show chart',
    });
    assertIconAndLayout(showChartBtn, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
      'min-w-[116px]',
    ]);
    fireEvent.click(showChartBtn);
    const hideChartBtn = screen.getByRole('button', { name: 'Hide chart' });
    assertIconAndLayout(hideChartBtn, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
      'min-w-[116px]',
    ]);

    const unwatchBtn = screen.getByRole('button', { name: 'Unwatch' });
    assertIconAndLayout(unwatchBtn, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
    ]);

    // Tracer tab
    fireEvent.click(screen.getByRole('tab', { name: /Tracer/i }));
    const traceSubmit = await screen.findByRole('button', { name: 'Trace' });
    assertIconAndLayout(traceSubmit, [
      'inline-flex',
      'whitespace-nowrap',
      'shrink-0',
    ]);
  });

  it('Watch keeps its DexScreener iframe mounted across tab switches while active tab indicator moves', async () => {
    const mint = addr('W');
    const pool = addr('P');
    const watchCoin: WatchCoin = {
      mint,
      symbol: 'KEEP',
      name: 'KeepMounted',
      pool,
      status: 'safe',
      score: 88,
      price_usd: 0.01,
      mcap_usd: 120000,
      liquidity_usd: 30000,
      vol_h24: 45000,
      image_url: null,
      reasons: ['Healthy flow'],
      alerts: [],
    };
    globalThis.fetch = mockFetch({
      watch: () => ({ ok: true, coins: [watchCoin] }),
    });

    render(<App />);

    const marketTab = screen.getByRole('tab', { name: /Market/i });
    const watchTab = screen.getByRole('tab', { name: /Watch/i });
    const pingTab = screen.getByRole('tab', { name: /Ping/i });

    expect(marketTab).toHaveAttribute('aria-selected', 'true');
    expect(marketTab.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(watchTab.querySelector('span[aria-hidden="true"]')).toBeNull();

    fireEvent.click(watchTab);
    expect(watchTab).toHaveAttribute('aria-selected', 'true');
    expect(watchTab.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(marketTab.querySelector('span[aria-hidden="true"]')).toBeNull();

    const showChartBtn = await screen.findByRole('button', { name: 'Show chart' });
    fireEvent.click(showChartBtn);

    const iframeEl = screen.getByTitle('KEEP live chart');
    expect(iframeEl).toBeInTheDocument();
    expect(iframeEl.getAttribute('src')).toContain(pool);

    // Switch to Ping and Market; Watch tabpanel becomes hidden but iframe stays mounted in DOM
    fireEvent.click(pingTab);
    expect(pingTab).toHaveAttribute('aria-selected', 'true');
    expect(pingTab.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(document.contains(iframeEl)).toBe(true);
    expect(iframeEl.closest('[role="tabpanel"]')).toHaveAttribute('hidden');

    fireEvent.click(marketTab);
    expect(document.contains(iframeEl)).toBe(true);
    expect(iframeEl.closest('[role="tabpanel"]')).toHaveAttribute('hidden');

    // Switch back to Watch: exact same iframe DOM node is still mounted and visible
    fireEvent.click(watchTab);
    expect(iframeEl.closest('[role="tabpanel"]')).not.toHaveAttribute('hidden');
    expect(screen.getByTitle('KEEP live chart')).toBe(iframeEl);
  });

  it('KindTooltip and Narratives detail rows animate open and closed cleanly on interaction', async () => {
    const { unmount } = render(<KindTooltip kind="buy" />);
    const btn = screen.getByRole('button', { name: 'What Buy means' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent(KIND_INFO.buy);

    fireEvent.mouseLeave(btn);
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
    unmount();

    const mint = addr('N');
    globalThis.fetch = mockFetch({
      narratives: () => ({
        running: [
          {
            mint,
            symbol: 'NRV',
            theme: 'agents',
            score: 72,
            band: 'confirm',
            mcap_usd: 42000,
            reasons: [{ part: 'wallets', points: 22, max: 30 }],
            unknowns: [],
          },
        ],
        themes: [],
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    const explainBtns = await screen.findAllByRole('button', { name: 'Explain score' });
    fireEvent.click(explainBtns[0]);
    expect(screen.getAllByRole('button', { name: 'Hide' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Hide' })[0]);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
    });
  });

  it('respects prefers-reduced-motion: reduce via MotionConfig reducedMotion="user"', async () => {
    const matchMediaMock = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    vi.stubGlobal('matchMedia', matchMediaMock);
    globalThis.fetch = mockFetch({});

    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: /Ping/i }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Ping/i })).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Narratives/i })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('NotificationBell records ping and narrative toasts (including >4 evicted), preserves unread on open/close, and supports click-to-navigate, mark all read, clear, Escape, and outside click', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    globalThis.fetch = mockFetch({
      ping: () => ({
        alerts: [
          { ts: nowSec - 1, kind: 'buy', mint: addr('1'), symbol: 'ONE', detail: { usd: 110 } },
          { ts: nowSec - 2, kind: 'buy', mint: addr('2'), symbol: 'TWO', detail: { usd: 120 } },
          { ts: nowSec - 3, kind: 'buy', mint: addr('3'), symbol: 'THREE', detail: { usd: 130 } },
          { ts: nowSec - 4, kind: 'buy', mint: addr('4'), symbol: 'FOUR', detail: { usd: 140 } },
          { ts: nowSec - 5, kind: 'exit_wallet', mint: addr('5'), symbol: 'FIVE', detail: { usd: 150 } },
        ],
        wallets: [],
      }),
      narratives: () => ({
        running: [
          {
            mint: addr('6'),
            symbol: 'NARR',
            band: 'strong',
            score: 91,
            theme: 'AI cats',
            signals: {},
            updated_at: nowSec,
          },
        ],
        themes: [],
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('6');
    });

    // Live toaster is capped at 4, while notification history keeps all 6
    const bellBtn = screen.getByRole('button', { name: 'Notifications' });
    fireEvent.click(bellBtn);

    const dialog = screen.getByRole('dialog', { name: 'Notification history' });
    expect(within(dialog).getByText('ONE')).toBeInTheDocument();
    expect(within(dialog).getByText('FIVE')).toBeInTheDocument();
    expect(within(dialog).getByText('NARR')).toBeInTheDocument();
    expect(within(dialog).getByText('91/100')).toBeInTheDocument();

    // Closing via Escape preserves unread count
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Notification history' })).toBeNull();
    });
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('6');

    // Reopen and close via outside click — still 6 unread
    fireEvent.click(bellBtn);
    expect(screen.getByRole('dialog', { name: 'Notification history' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Notification history' })).toBeNull();
    });
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('6');

    // Click narrative notification -> marks read (5 unread), closes dropdown, switches to Narratives
    fireEvent.click(bellBtn);
    const dialog2 = screen.getByRole('dialog', { name: 'Notification history' });
    fireEvent.click(within(dialog2).getByText('NARR'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Notification history' })).toBeNull();
    });
    expect(screen.getByRole('tab', { name: /Narratives/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('5');

    // Click ping notification -> marks read (4 unread), closes dropdown, switches to Ping
    fireEvent.click(bellBtn);
    const dialog3 = screen.getByRole('dialog', { name: 'Notification history' });
    fireEvent.click(within(dialog3).getByText('FIVE'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Notification history' })).toBeNull();
    });
    expect(screen.getByRole('tab', { name: /Ping/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('4');

    // Mark all read -> clears badge, keeps items
    fireEvent.click(bellBtn);
    const dialog4 = screen.getByRole('dialog', { name: 'Notification history' });
    fireEvent.click(within(dialog4).getByRole('button', { name: 'Mark all read' }));
    expect(screen.queryByTestId('notification-unread-badge')).toBeNull();
    expect(within(dialog4).getByText('ONE')).toBeInTheDocument();

    // Clear -> empties list and shows empty state
    fireEvent.click(within(dialog4).getByRole('button', { name: 'Clear' }));
    expect(within(dialog4).getByText('No notifications yet.')).toBeInTheDocument();
    expect(within(dialog4).queryByText('ONE')).toBeNull();
  });

  it('NotificationBell retains auto-dismissed (30s) toasts', async () => {
    vi.useFakeTimers();
    try {
      let poll = 0;
      globalThis.fetch = mockFetch({
        ping: () =>
          poll === 0
            ? { alerts: [], wallets: [] }
            : {
                alerts: [
                  {
                    ts: 1700000300,
                    kind: 'exit_wallet',
                    mint: addr('A'),
                    wallet: addr('W'),
                    symbol: 'RETAINED',
                    detail: { usd: 420 },
                  },
                ],
                wallets: [],
              },
      });

      render(<App />);
      await act(async () => {
        await Promise.resolve();
      });

      poll = 1;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(screen.getByText('RETAINED')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // Toast is auto-dismissed from PingToaster
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1');

      // Still present in NotificationBell dropdown
      fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
      const dialog = screen.getByRole('dialog', { name: 'Notification history' });
      expect(within(dialog).getByText('RETAINED')).toBeInTheDocument();
      expect(within(dialog).getByText('$420')).toBeInTheDocument();
    } finally {
      cleanup();
      await vi.advanceTimersByTimeAsync(200);
      vi.useRealTimers();
    }
  });

  it('NotificationBell persists history and read state in localStorage across remounts, capped at 50', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const alerts = Array.from({ length: 55 }, (_, i) => ({
      ts: nowSec - i,
      kind: 'buy',
      mint: addr(String.fromCharCode(65 + (i % 26)) + i),
      symbol: `TOK${i}`,
      detail: { usd: 200 + i },
    }));

    globalThis.fetch = mockFetch({
      ping: () => ({ alerts, wallets: [] }),
    });

    const firstRender = render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('50');
    });

    // Mark TOK0 as read before unmounting
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog1 = screen.getByRole('dialog', { name: 'Notification history' });
    expect(within(dialog1).getByText('TOK0')).toBeInTheDocument();
    expect(within(dialog1).getByText('TOK49')).toBeInTheDocument();
    expect(within(dialog1).queryByText('TOK50')).toBeNull();

    fireEvent.click(within(dialog1).getByText('TOK0'));
    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('49');
    });

    firstRender.unmount();

    // Remount with empty poll responses -> history & read state come from localStorage
    globalThis.fetch = mockFetch({});
    render(<App />);

    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('49');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog2 = screen.getByRole('dialog', { name: 'Notification history' });
    expect(within(dialog2).getByText('TOK0').closest('button')).toHaveAttribute('data-read', 'true');
    expect(within(dialog2).getByText('TOK1').closest('button')).toHaveAttribute('data-read', 'false');
    expect(within(dialog2).queryByText('TOK50')).toBeNull();
  });

  it('NotificationBell preserves read state when sessionStorage is cleared and the same narrative poll arrives on remount', async () => {
    const mint = addr('R');
    let narrativeFetches = 0;
    globalThis.fetch = mockFetch({
      narratives: () => {
        narrativeFetches += 1;
        return {
          themes: [],
          running: [
            {
              mint,
              symbol: 'READOK',
              name: 'Read OK',
              theme: 'ai-agents',
              score: 86,
              band: 'strong',
              mcap_usd: 150000,
              unknowns: [],
              reasons: [],
            },
          ],
          watchlist: [],
          wallets: [],
          calibration: { rows: [], missed: 0 },
        };
      },
    });

    const firstRender = render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog1 = screen.getByRole('dialog', { name: 'Notification history' });
    fireEvent.click(within(dialog1).getByText('READOK'));

    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).toBeNull();
    });

    firstRender.unmount();
    window.sessionStorage.clear();
    const fetchesBeforeRemount = narrativeFetches;

    render(<App />);

    await waitFor(() => {
      expect(narrativeFetches).toBeGreaterThan(fetchesBeforeRemount);
    });

    // Wait for enqueueToasts to process the poll response and verify read state is preserved
    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog2 = screen.getByRole('dialog', { name: 'Notification history' });
    expect(within(dialog2).getByText('READOK').closest('button')).toHaveAttribute('data-read', 'true');
  });

  it('NotificationBell drops malformed localStorage entries missing required alert or coin fields without crashing', async () => {
    window.localStorage.setItem(
      'cheesequake:notification-history',
      JSON.stringify([
        { toast: { id: 'bad-ping', kind: 'ping', alert: {} }, createdAt: Date.now(), read: false },
        { toast: { id: 'bad-narrative', kind: 'narrative', coin: {} }, createdAt: Date.now(), read: false },
        { toast: { id: 'bad-array', kind: 'ping', alert: [] }, createdAt: Date.now(), read: false },
        {
          toast: {
            id: 'good-ping',
            kind: 'ping',
            alert: {
              ts: Math.floor(Date.now() / 1000),
              kind: 'buy',
              mint: addr('G'),
              symbol: 'GOOD',
              detail: { usd: 150 },
            },
          },
          createdAt: Date.now(),
          read: false,
        },
      ]),
    );

    globalThis.fetch = mockFetch({});
    render(<App />);

    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = screen.getByRole('dialog', { name: 'Notification history' });
    expect(within(dialog).getByText('GOOD')).toBeInTheDocument();
  });

  it('Narratives hides watched coins by default and reveals them when Hide watched is toggled off', async () => {
    const mintFresh = addr('F');
    const mintWatched = addr('W');
    globalThis.fetch = mockFetch({
      narratives: () => ({
        running: [
          { mint: mintFresh, symbol: 'FRSH', watched: false, theme: null, score: 85, band: 'strong', mcap_usd: 150000, reasons: [], unknowns: [] },
          { mint: mintWatched, symbol: 'WTCD', watched: true, theme: null, score: 78, band: 'confirm', mcap_usd: 200000, reasons: [], unknowns: [] },
        ],
        themes: [],
        wallets: [],
        calibration: { rows: [], missed: 0 },
      }),
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));

    const toggle = await screen.findByLabelText('Hide watched');
    expect(toggle).toBeChecked();
    const runningSection = screen.getByRole('heading', { name: 'Running now' }).closest('section')!;
    expect(within(runningSection).getAllByText('FRSH').length).toBeGreaterThan(0);
    expect(within(runningSection).queryByText('WTCD')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(within(runningSection).getAllByText('WTCD').length).toBeGreaterThan(0);
  });

  it('Narratives gems-only chip filters to gem rows, shows the badge and empty state, and persists across remount', async () => {
    const mintGem = addr('G');
    const mintPlain = addr('P');
    let running = [
      { mint: mintGem, symbol: 'GEMM', watched: false, gem: true, theme: null, score: 85, band: 'strong', mcap_usd: 150000, reasons: [], unknowns: [] },
      { mint: mintPlain, symbol: 'PLAN', watched: false, gem: false, theme: null, score: 70, band: 'confirm', mcap_usd: 200000, reasons: [], unknowns: [] },
    ];
    globalThis.fetch = mockFetch({
      narratives: () => ({ running, themes: [], wallets: [], calibration: { rows: [], missed: 0 } }),
    });

    const first = render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    const chip = await screen.findByLabelText('Early gems only');
    expect(chip).not.toBeChecked();
    expect((await screen.findAllByText('Early gem')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('PLAN').length).toBeGreaterThan(0);

    fireEvent.click(chip);
    const section = () => screen.getByRole('heading', { name: 'Running now' }).closest('section')!;
    expect(within(section()).getAllByText('GEMM').length).toBeGreaterThan(0);
    expect(within(section()).queryByText('PLAN')).toBeNull();

    first.unmount();
    render(<App />);
    expect(await screen.findByLabelText('Early gems only')).toBeChecked();
    expect(within(section()).queryByText('PLAN')).toBeNull();
    expect(within(section()).getAllByText('GEMM').length).toBeGreaterThan(0);
  });

  it('Narratives gems-only shows the gem empty state when no running coin is a gem', async () => {
    globalThis.fetch = mockFetch({
      narratives: () => ({
        running: [{ mint: addr('P'), symbol: 'PLAN', watched: false, theme: null, score: 70, band: 'confirm', mcap_usd: 200000, reasons: [], unknowns: [] }],
        themes: [], wallets: [], calibration: { rows: [], missed: 0 },
      }),
    });
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Narratives/i }));
    fireEvent.click(await screen.findByLabelText('Early gems only'));
    expect(screen.getByText(/No early gems right now/)).toBeInTheDocument();
  });

  describe('AddressLink copy', () => {
    const origSecureDesc = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    const origClipboardDesc = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const origExecCommandDesc = Object.getOwnPropertyDescriptor(document, 'execCommand');

    const restoreDescriptor = (
      target: object,
      key: string,
      desc: PropertyDescriptor | undefined,
    ) => {
      if (desc) {
        Object.defineProperty(target, key, desc);
      } else {
        delete (target as Record<string, unknown>)[key];
      }
    };

    afterEach(() => {
      vi.useRealTimers();
      restoreDescriptor(window, 'isSecureContext', origSecureDesc);
      restoreDescriptor(navigator, 'clipboard', origClipboardDesc);
      restoreDescriptor(document, 'execCommand', origExecCommandDesc);
    });

    it('preserves Solscan link and renders inline copy button', () => {
      const mint = addr('A');
      render(<AddressLink address={mint} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', `https://solscan.io/account/${mint}`);
      expect(link).toHaveAttribute('target', '_blank');

      const copyBtn = screen.getByRole('button', { name: 'Copy address' });
      expect(copyBtn).toHaveAttribute('type', 'button');
    });

    it('copies full address via navigator.clipboard.writeText in secure context and resets copied state after 1500ms', async () => {
      vi.useFakeTimers();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const mint = addr('B');
      render(<AddressLink address={mint} />);

      const copyBtn = screen.getByRole('button', { name: 'Copy address' });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeText).toHaveBeenCalledWith(mint);
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByRole('button', { name: 'Copy address' })).toBeInTheDocument();
    });

    it('falls back to textarea + document.execCommand("copy") on non-HTTPS origins and when Clipboard API rejects', async () => {
      const mint = addr('C');
      let copiedValue = '';
      const execCommand = vi.fn((cmd: string) => {
        if (cmd === 'copy') {
          const ta = document.body.querySelector('textarea');
          copiedValue = ta?.value ?? '';
          return true;
        }
        return false;
      });
      Object.defineProperty(document, 'execCommand', {
        value: execCommand,
        configurable: true,
      });

      // Case 1: non-HTTPS origin (isSecureContext = false)
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });

      const { unmount } = render(<AddressLink address={mint} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      });
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(copiedValue).toBe(mint);
      expect(document.body.querySelector('textarea')).toBeNull();
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      unmount();

      // Case 2: secure context but navigator.clipboard.writeText rejects
      copiedValue = '';
      execCommand.mockClear();
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true,
      });

      render(<AddressLink address={mint} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      });
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(copiedValue).toBe(mint);
      expect(document.body.querySelector('textarea')).toBeNull();
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('does not show Copied state when both Clipboard API and execCommand fail', async () => {
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      Object.defineProperty(document, 'execCommand', {
        value: vi.fn(() => false),
        configurable: true,
      });

      render(<AddressLink address={addr('D')} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      });
      expect(screen.getByRole('button', { name: 'Copy address' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    });

    it('stops click propagation so parent clickable containers do not fire', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      const onParentClick = vi.fn();

      render(
        <div onClick={onParentClick}>
          <AddressLink address={addr('E')} />
        </div>,
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(onParentClick).not.toHaveBeenCalled();
    });
  });
});
