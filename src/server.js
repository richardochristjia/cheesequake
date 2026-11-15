import http from 'node:http';
import { readFileSync } from 'node:fs';
import { B58 } from './wallets.js';
import { recentHourly, trenchIndex } from './market.js';
import { runningNow } from './score.js';
import { scorecardFor } from './scorecard.js';
import { calibration } from './outcomes.js';

const PAGE = new URL('../public/index.html', import.meta.url);

// deps: {db, config, tracer: {start(wallet), get(wallet)}, wallets: () => [{address,label}], now}
export function createServer({ db, config, tracer, wallets = () => [], now = Date.now }) {
  const api = {
    '/api/market': () => {
      const hourly = recentHourly(db, config.index.windowHours);
      return { index: trenchIndex(hourly), hours: hourly.length, warmupHours: config.index.warmupHours, hourly };
    },
    '/api/ping': (q) => {
      const kind = q.get('kind');
      const where = !kind ? '' : kind === 'exit' ? "WHERE kind LIKE 'exit\\_%' ESCAPE '\\'" : 'WHERE kind = ?';
      const rows = db.prepare(`SELECT a.ts, a.kind, a.mint, a.wallet, a.detail, t.symbol, t.name FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint ${where} ORDER BY a.ts DESC, a.id DESC LIMIT 200`)
        .all(...(kind && kind !== 'exit' ? [kind] : []));
      return { alerts: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail || '{}') })) };
    },
    '/api/narratives': () => {
      const hour = Math.floor(now() / 1000 / 3600) * 3600;
      return {
        themes: db.prepare('SELECT keyword, tokens, volume, share FROM theme_hourly WHERE hour = ? ORDER BY volume DESC').all(hour),
        running: runningNow(db, now()),
        wallets: wallets().map((w) => ({ ...w, ...scorecardFor(db, w.address, config) })),
        calibration: calibration(db, config),
      };
    },
    '/api/tracer': (q) => {
      const w = q.get('wallet') ?? '';
      if (!B58.test(w)) return [400, { error: 'invalid wallet address' }];
      tracer.start(w);
      return tracer.get(w);
    },
  };

  return http.createServer((req, res) => {
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'x-content-type-options': 'nosniff' });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    // Blocks DNS rebinding: a hostile page that rebinds its name to 127.0.0.1 still sends its own Host.
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) return send(403, { error: 'forbidden host' });
    if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/') return send(200, readFileSync(PAGE, 'utf8'), 'text/html');
      const h = Object.hasOwn(api, url.pathname) && api[url.pathname];
      if (!h) return send(404, { error: 'not found' });
      const out = h(url.searchParams);
      return Array.isArray(out) ? send(out[0], out[1]) : send(200, out);
    } catch (e) {
      console.error(`server: ${e.message}`);
      return send(500, { error: 'internal error' });
    }
  });
}

// Binds to loopback only.
export function startServer(deps, port = deps.config.port) {
  const server = createServer(deps);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
