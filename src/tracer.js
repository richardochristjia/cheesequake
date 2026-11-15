import { readFileSync } from 'node:fs';
import { config as defaultConfig } from './config.js';
import { tokenDeltas, WSOL, USDC, USDT } from './trades.js';

export function loadLabels(path) {
  try {
    return new Map(JSON.parse(readFileSync(path, 'utf8')).labels.map((l) => [l.address, l]));
  } catch { return new Map(); }
}

// USD change per address in one transaction (native SOL, wrapped SOL, USDC, USDT).
function usdDeltas(tx, solUsd) {
  const out = new Map();
  const add = (a, v) => out.set(a, (out.get(a) ?? 0) + v);
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  keys.forEach((k, i) => add(k, ((tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9) * solUsd));
  const owners = new Set([...(tx.meta.preTokenBalances ?? []), ...(tx.meta.postTokenBalances ?? [])].map((e) => e.owner));
  for (const o of owners) {
    const d = tokenDeltas(tx.meta, o);
    add(o, (d[WSOL] ?? 0) * solUsd + (d[USDC] ?? 0) + (d[USDT] ?? 0));
  }
  return out;
}

// Breadth-first fund flow. Returns {status, nodes, edges}; a source failure keeps what was found.
export async function runTrace({ rpc, start, labels, solUsd, config = defaultConfig }) {
  const t = config.tracer;
  const nodes = new Map([[start, { address: start, label: labels.get(start)?.name ?? null, type: labels.get(start)?.type ?? null, depth: 0 }]]);
  const edges = [];
  let status = 'done';
  const queue = labels.has(start) ? [] : [start];
  try {
    while (queue.length) {
      const w = queue.shift();
      const depth = nodes.get(w).depth;
      if (depth >= t.depth) continue;
      const dests = new Map();
      for (const s of await rpc.signatures(w, { limit: t.signatures })) {
        const tx = await rpc.transaction(s.signature);
        if (!tx || tx.meta?.err) continue;
        const d = usdDeltas(tx, solUsd);
        const out = -(d.get(w) ?? 0);
        if (out <= 0) continue;
        const [to, gain] = [...d].filter(([a]) => a !== w).sort((a, b) => b[1] - a[1])[0] ?? [];
        if (!to || gain <= 0) continue;
        const e = dests.get(to) ?? { usd: 0, txCount: 0 };
        dests.set(to, { usd: e.usd + Math.min(out, gain), txCount: e.txCount + 1 });
      }
      for (const [to, e] of [...dests].sort((a, b) => b[1].usd - a[1].usd).slice(0, t.top)) {
        edges.push({ from: w, to, usd: e.usd, txCount: e.txCount });
        if (nodes.has(to)) continue;
        const l = labels.get(to);
        nodes.set(to, { address: to, label: l?.name ?? null, type: l?.type ?? null, depth: depth + 1 });
        if (!l) queue.push(to);
      }
    }
  } catch (e) {
    console.error(`tracer: ${e.message}`);
    status = 'partial';
  }
  return { status, nodes: [...nodes.values()], edges };
}

const running = new Map();

// Returns the cached trace when under 24 h old; otherwise starts one in the background.
// `run` is the in-flight promise (for tests and shutdown).
export function startTrace({ db, rpc, labels, solUsd, now, start, config = defaultConfig }) {
  const nowS = Math.floor(now() / 1000);
  const row = db.prepare('SELECT ts, status FROM trace_cache WHERE start = ?').get(start);
  if (row && (row.status === 'running' || nowS - row.ts < config.tracer.cacheHours * 3600)) return { status: row.status };
  db.prepare("INSERT OR REPLACE INTO trace_cache(start, ts, status, json) VALUES (?,?,'running','{}')").run(start, nowS);
  const run = runTrace({ rpc, start, labels, solUsd, config }).then((r) => {
    db.prepare('INSERT OR REPLACE INTO trace_cache(start, ts, status, json) VALUES (?,?,?,?)').run(start, nowS, r.status, JSON.stringify(r));
  }).finally(() => running.delete(start));
  running.set(start, run);
  return { status: 'running', run };
}

export function getTrace(db, start) {
  const row = db.prepare('SELECT status, json FROM trace_cache WHERE start = ?').get(start);
  if (!row) return { status: 'none', nodes: [], edges: [] };
  const j = JSON.parse(row.json);
  return { status: row.status, nodes: j.nodes ?? [], edges: j.edges ?? [] };
}
