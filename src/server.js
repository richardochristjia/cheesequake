import http from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { B58 } from './wallets.js';
import { recentHourly, trenchIndex } from './market.js';
import { runningNow, watchList, enrichAlert } from './score.js';
import { scorecardFor } from './scorecard.js';
import { calibration } from './outcomes.js';

const DIST_DIR = path.resolve(fileURLToPath(new URL('../public/dist', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const VALID_SCOPES = new Set(['market', 'watch', 'ping', 'narratives', 'tracer']);

// deps: {db, config, tracer: {start(wallet), get(wallet)}, wallets: () => [{address,label}], onWatch, events, now}
export function createServer({ db, config, tracer, wallets = () => [], onWatch = () => {}, events = new EventEmitter(), now = Date.now }) {
  const clients = new Set();
  const broadcast = (scopes) => {
    const valid = [...new Set((Array.isArray(scopes) ? scopes : [scopes]).filter((s) => VALID_SCOPES.has(s)))];
    if (!valid.length) return;
    const payload = `event: update\ndata: ${JSON.stringify({ scopes: valid })}\n\n`;
    for (const client of [...clients]) {
      if (client.res.writableEnded || client.res.destroyed) {
        client.cleanup();
        continue;
      }
      try {
        client.res.write(payload);
      } catch {
        client.cleanup();
      }
    }
  };
  events?.on('update', broadcast);
  const api = {
    '/api/market': () => {
      const hourly = recentHourly(db, config.index.windowHours);
      return { index: trenchIndex(hourly), hours: hourly.length, warmupHours: config.index.warmupHours, hourly };
    },
    '/api/watch': () => ({ coins: watchList(db, now(), config, wallets()) }),
    '/api/ping': (q) => {
      const kind = q.get('kind');
      const wallet = q.get('wallet') ?? '';
      if (wallet && !B58.test(wallet)) return [400, { error: 'invalid wallet address' }];
      const clauses = [];
      const params = [];
      if (kind === 'exit') clauses.push("a.kind LIKE 'exit\\_%' ESCAPE '\\'");
      else if (kind) { clauses.push('a.kind = ?'); params.push(kind); }
      if (wallet) { clauses.push("(a.wallet = ? OR a.kind = 'consensus')"); params.push(wallet); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = wallet ? '' : 'LIMIT 200';
      const rows = db.prepare(`SELECT a.ts, a.kind, a.mint, a.wallet, a.detail, t.symbol, t.name, t.image_url FROM alerts a LEFT JOIN tokens t ON t.mint = a.mint ${where} ORDER BY a.ts DESC, a.id DESC ${limit}`)
        .all(...params);
      const wl = wallets();
      const labelOf = new Map(wl.filter((w) => w?.label).map((w) => [w.address, w.label]));
      const alerts = rows
        .map((r) => enrichAlert(r, labelOf))
        .filter((a) => !wallet || a.wallet === wallet || (a.kind === 'consensus' && Array.isArray(a.detail.wallets) && a.detail.wallets.includes(wallet)))
        .slice(0, 200);
      return { alerts, wallets: wl };
    },
    '/api/narratives': () => {
      const hour = Math.floor(now() / 1000 / 3600) * 3600;
      return {
        themes: db.prepare('SELECT keyword, tokens, volume, share FROM theme_hourly WHERE hour = ? ORDER BY volume DESC').all(hour),
        running: runningNow(db, now(), config),
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

  const server = http.createServer((req, res) => {
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'x-content-type-options': 'nosniff' });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    // Blocks DNS rebinding: a hostile page that rebinds its name to 127.0.0.1 still sends its own Host.
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) return send(403, { error: 'forbidden host' });
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/api/watch' && (req.method === 'POST' || req.method === 'DELETE')) {
        const mint = url.searchParams.get('mint') ?? '';
        if (!B58.test(mint)) return send(400, { error: 'invalid mint address' });
        if (req.method === 'POST') {
          db.prepare('INSERT OR IGNORE INTO watched_coins(mint, added_ts) VALUES (?,?)').run(mint, Math.floor(now() / 1000));
          onWatch(mint);
        } else {
          db.prepare('DELETE FROM watched_coins WHERE mint = ?').run(mint);
        }
        broadcast(['watch']);
        return send(200, { ok: true, coins: watchList(db, now(), config, wallets()) });
      }
      if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
      if (url.pathname === '/api/events') {
        req.socket?.setTimeout?.(0);
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-content-type-options': 'nosniff',
        });
        res.write(': connected\n\n');
        let closed = false;
        const client = {
          res,
          cleanup: () => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            clients.delete(client);
          },
        };
        const heartbeat = setInterval(() => {
          if (res.writableEnded || res.destroyed) return client.cleanup();
          try {
            res.write(': ping\n\n');
          } catch {
            client.cleanup();
          }
        }, 25000);
        heartbeat.unref?.();
        clients.add(client);
        req.on('close', client.cleanup);
        res.on('close', client.cleanup);
        return;
      }
      if (url.pathname === '/') {
        const indexPath = path.join(DIST_DIR, 'index.html');
        if (!existsSync(indexPath)) return send(404, { error: 'not found' });
        return send(200, readFileSync(indexPath, 'utf8'), 'text/html');
      }
      const h = Object.hasOwn(api, url.pathname) && api[url.pathname];
      if (h) {
        const out = h(url.searchParams);
        return Array.isArray(out) ? send(out[0], out[1]) : send(200, out);
      }
      if (!url.pathname.startsWith('/api/')) {
        let decoded;
        try { decoded = decodeURIComponent(url.pathname); } catch { return send(400, { error: 'bad path' }); }
        const resolved = path.resolve(DIST_DIR, '.' + decoded);
        if (resolved.startsWith(DIST_DIR + path.sep) && existsSync(resolved) && statSync(resolved).isFile()) {
          const ext = path.extname(resolved).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, { 'content-type': contentType, 'x-content-type-options': 'nosniff' });
          return res.end(readFileSync(resolved));
        }
      }
      return send(404, { error: 'not found' });
    } catch (e) {
      console.error(`server: ${e.message}`);
      return send(500, { error: 'internal error' });
    }
  });

  server.broadcast = broadcast;
  server.on('close', () => {
    events?.off('update', broadcast);
    for (const client of [...clients]) client.cleanup();
  });
  return server;
}

// Binds to loopback only.
export function startServer(deps, port = deps.config.port) {
  const server = createServer(deps);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
