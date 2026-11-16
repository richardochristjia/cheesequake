#!/usr/bin/env node
import { config } from './config.js';
import { openDb } from './db.js';
import { createClient } from './http.js';
import { loadWallets } from './wallets.js';
import { createRpc } from './sources/solana.js';
import { sampleNewPools, snapTrending, rollHourly, last } from './market.js';
import { runWalletCycle, deployerWallets, checkExits } from './ping.js';
import { runCandidates } from './score.js';
import { fillOutcomes } from './outcomes.js';
import { startTrace, getTrace, loadLabels } from './tracer.js';
import { startServer } from './server.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = (host) => createClient({ fetch: globalThis.fetch, sleep, now: Date.now, minGapMs: config.pace[host], retry: config.retry });
const geckoGet = client('geckoterminal');
const dexGet = client('dexscreener');
const rugGet = client('rugcheck');
const rpc = createRpc(client('rpc'), config.rpcUrl);

const db = openDb(config.dbPath);
const now = Date.now;
const labels = loadLabels(config.labelsPath);
const walletList = () => loadWallets(config.walletsPath);

const tracer = {
  start: (wallet) => (last.solUsd ? startTrace({ db, rpc, labels, solUsd: last.solUsd, now, start: wallet, config }) : { status: 'waiting' }),
  get: (wallet) => (last.solUsd ? getTrace(db, wallet) : { status: 'waiting for SOL price', nodes: [], edges: [] }),
};

const timers = [];
// A thrown error is logged and the timer carries on; a cycle still running is skipped.
function every(name, ms, fn) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { console.error(`${name}: ${e.message}`); } finally { busy = false; }
  };
  tick();
  timers.push(setInterval(tick, ms));
}

const onWatch = () => {
  runCandidates({ db, deps: { dexGet, geckoGet, rugGet, rpc }, tracked: walletList().map((w) => w.address), now, config })
    .then(() => checkExits({ db, tracked: walletList().map((w) => w.address), now: now(), config }))
    .catch((e) => console.error('watch:', e.message));
};
const server = await startServer({ db, config, tracer, wallets: walletList, onWatch, now });
console.log(`Cheesequake dashboard: http://127.0.0.1:${server.address().port}`);

every('new pools', config.intervals.newPools, async () => { await sampleNewPools({ db, get: geckoGet, now }); rollHourly({ db, now }); });
every('trending', config.intervals.trending, () => snapTrending({ db, get: geckoGet, now }));
every('wallets', config.intervals.wallets, async () => {
  if (!last.solUsd) return; // trades cannot be valued before the first SOL price
  const tracked = walletList().map((w) => w.address);
  await runWalletCycle({ db, rpc, tracked, deployers: deployerWallets(db, now()), solUsd: last.solUsd, now, config });
});
every('candidates', config.intervals.candidates, () =>
  runCandidates({ db, deps: { dexGet, geckoGet, rugGet, rpc }, tracked: walletList().map((w) => w.address), now, config }));
every('outcomes', config.intervals.outcomes, () => fillOutcomes({ db, dexGet, now }));

process.on('SIGINT', () => {
  timers.forEach(clearInterval);
  server.close(() => { db.close(); process.exit(0); });
  server.closeAllConnections?.();
});
