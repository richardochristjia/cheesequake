import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import App from '../App';
import { KindTooltip } from '../components/KindTooltip';
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

describe('Cheesequake UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
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
      const tip = screen.getByRole('tooltip', { hidden: true });
      expect(tip.textContent).toBe(KIND_INFO[kind]);
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
      themes: Array.from({ length: 7 }, (_, i) => ({ keyword: `word${i}`, tokens: 3, volume: 1000 - i, share: 0.2 })),
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
    expect(document.querySelectorAll('iframe').length).toBe(0);

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
});
