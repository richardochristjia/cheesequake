# Watch Coins

## Problem

When `runCandidates` in `src/score.js` scans tokens, any token that fails a safety veto is saved with `listed = 0` (stopping immediately after cheap vetoes) and excluded from `runningNow`, while `deployerWallets` and `checkExits` in `src/ping.js` only monitor `listed = 1` candidates from the last 24 hours, and the `Ping` tab mixes alerts across all tokens. Users have no way to pin specific coins they are watching, see whether each coin is still safe to hold or has turned into a red flag with plain-English reasons, view its dedicated ping feed, or open an embedded live DexScreener candle chart.

## Solution

- Add `CREATE TABLE IF NOT EXISTS watched_coins(mint PRIMARY KEY, added_ts);` to `SCHEMA` in `src/db.js`.
- In `src/ping.js`:
  - Update `deployerWallets(db, now)` to return creators of the top 20 `listed = 1` candidates from the last 24 hours **plus** any non-null `t.creator` for mints in `watched_coins`.
  - Update `checkExits({ db, tracked, now, config })` so the monitored `mints` set unions `listed = 1` candidates from the last 24 hours with all mints in `watched_coins` (`LEFT JOIN tokens t ON t.mint = ...`), firing `exit_deployer`, `exit_wallet`, `exit_liquidity`, and `exit_divergence` alerts for watched coins regardless of `listed` status or age.
- In `src/score.js`:
  - Add `watchedMints(db)` returning `SELECT mint FROM watched_coins ORDER BY added_ts DESC`.
  - In `runCandidates({ db, deps, tracked, now, config })`, place `watchedMints(db)` first in `universe` (before tracked-wallet buys, trending, boosts, and profiles). For watched mints, do not `continue` early when `cheap.vetoes.length > 0`; still fetch/reuse the RugCheck report and `mintInfo`, evaluate all remaining vetoes (`evaluate` with `names: undefined`), and when any veto trips (`vetoes.length > 0`), save the candidate with `score: 0, band: 'avoid', listed: 0, vetoes, unknowns`.
  - Export `watchList(db, now, config = defaultConfig)` returning every row in `watched_coins` (`ORDER BY added_ts DESC`) enriched with:
    - Token metadata (`symbol`, `name`, `creator` from `tokens`), latest `pool_snapshots` row (`pool`, `price_usd`, `mcap_usd`, `liquidity_usd`), latest `candidates` row (`score`, `band`, `vetoes`, `reasons`, `unknowns`, `ts`), and the coin's recent alerts (`SELECT ts, kind, mint, wallet, detail FROM alerts WHERE mint = ? ORDER BY ts DESC, id DESC LIMIT 50`).
    - Hold status (`status`, `label`, `reasons`):
      - `flag` (`Red flag`): Any non-`age` veto in `vetoes` (`mint_authority`, `freeze_authority`, `rugged`, `transfer_fee`, `lp_unlocked`, `top10`, `insiders`, `liquidity`, `wash`) or any `exit_deployer` or `exit_liquidity` alert in the last 24 hours (`ts > nowS - 86400`).
      - `caution` (`Caution`): Not `flag`, and has no candidate scan yet (`!cand`), or has `exit_wallet` or `exit_divergence` alert in the last 24 hours, or trips `age` veto, or `score < 45`, or `unknowns.length > 0`.
      - `safe` (`Safe to hold`): Scanned candidate with no vetoes, no exit alerts in the last 24 hours, no unknowns, and `score >= 45`.
- In `src/server.js`:
  - Accept an optional `onWatch = () => {}` callback in `createServer({ db, config, tracer, wallets, onWatch, now })`.
  - Allow `POST` and `DELETE` only when `url.pathname === '/api/watch'`; keep returning `405` for non-`GET` on all other routes.
  - `GET /api/watch` returns `{ coins: watchList(db, now(), config) }`.
  - `POST /api/watch?mint=<mint>` validates `B58.test(mint)` (`400` if invalid), inserts into `watched_coins(mint, added_ts)` (`INSERT OR IGNORE`, `Math.floor(now() / 1000)`), calls `onWatch(mint)`, and returns `{ ok: true, coins: watchList(db, now(), config) }`.
  - `DELETE /api/watch?mint=<mint>` validates `B58.test(mint)` (`400` if invalid), deletes from `watched_coins`, and returns `{ ok: true, coins: watchList(db, now(), config) }`.
- In `src/main.js`, pass `onWatch: () => { runCandidates({ db, deps: { dexGet, geckoGet, rugGet, rpc }, tracked: walletList().map((w) => w.address), now, config }).then(() => checkExits({ db, tracked: walletList().map((w) => w.address), now: now(), config })).catch((e) => console.error('watch:', e.message)); }` into `startServer`.
- In `public/index.html`:
  - Add `<section id="watch" hidden></section>` and a `watch` tab in `TABS` (`{ market, watch, ping, narratives, tracer }`).
  - Add quick `Watch` / `Watching` toggle buttons on `Running now` rows and `Ping` rows.
  - On the `Watch` tab, render a mint input + `Watch coin` button and a card for each watched coin showing its status badge (`Safe to hold` `.good`, `Caution` `.mid`, `Red flag` `.bad`), plain-English reasons list, score/price/mcap/liquidity, a `Show chart` / `Hide chart` toggle button (preserving open state in `openCharts` across refreshes) that renders a lazy `<iframe>` pointing to `https://dexscreener.com/solana/${ encodeURIComponent(c.pool || c.mint) }?embed=1&theme=dark&trades=0&info=0`, an `Unwatch` button, and the coin's ping alerts table.

## Files

- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/db.js` — Add `watched_coins(mint PRIMARY KEY, added_ts)` table to `SCHEMA`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/ping.js` — Include `watched_coins` mints and their creators in `deployerWallets` and `checkExits`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/score.js` — Prioritize watched mints in `runCandidates`, evaluate full vetoes on watched mints when cheap vetoes fail, and export `watchedMints` and `watchList`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/server.js` — Add `GET`, `POST`, and `DELETE` handling for `/api/watch` and `onWatch` hook.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/main.js` — Wire `onWatch` to trigger an immediate candidate and exit check cycle.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/public/index.html` — Add `Watch` tab, hold/red-flag badge and reasons, per-coin ping table, quick-watch buttons, and lazy-loaded DexScreener candle chart `<iframe>`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/ping.test.js` — Add tests for `deployerWallets` and `checkExits` covering unlisted watched coins.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/score.test.js` — Add tests for watched-mint full veto evaluation and `watchList` status classification (`safe`, `caution`, `flag`).
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/server.test.js` — Add tests for `/api/watch` CRUD, `400`/`405` guards, and `Watch` tab UI + chart iframe toggle.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/.agents/RECORD.md` — Amend the `(ping)` exit-alert entry and add `(watch)` entries.

## Acceptance criteria

1. `POST /api/watch?mint=<mint>` and `DELETE /api/watch?mint=<mint>` add and remove watched mints, invalid mints return `400`, and `POST` to other routes still returns `405` (`node --test test/server.test.js`).
2. `runCandidates` places watched mints first and evaluates all vetoes on watched mints even when a cheap veto trips (`node --test test/score.test.js`).
3. `deployerWallets` and `checkExits` monitor watched mints even when `listed = 0` or older than 24 hours (`node --test test/ping.test.js`).
4. `watchList` and `GET /api/watch` classify watched coins into `safe` (`Safe to hold`), `caution` (`Caution`), or `flag` (`Red flag`) with plain-English reasons, latest pool data, and per-coin ping alerts (`node --test test/score.test.js test/server.test.js`).
5. The dashboard `Watch` tab renders watched coins, toggles the embedded DexScreener candle chart `<iframe>` while preserving open chart state across refreshes, and never assigns `innerHTML` (`node --test test/server.test.js`).
6. Full test suite passes with zero network calls (`node --test`).
7. Record Updates in `.agents/RECORD.md`: amend `- (ping) Exit alerts are raised for listed and watched tokens on tracked-wallet sells, deployer sells and sharp liquidity drops.` and add `- (watch) Watched tokens are managed from the dashboard and persisted to SQLite.` and `- (watch) Each watched token carries a hold status derived from its latest safety vetoes, exit alerts and score.`
8. `manual: Start the server with npm start, watch a live Solana mint in the Watch tab, and click "Show chart" to verify the live DexScreener candle iframe loads in your browser.`

## Risks

- **Newly watched coin has no snapshots or candidate row yet:** `watchList` returns `status: 'caution'` (`Waiting for first safety scan`) and `onWatch` triggers an immediate background scan; the chart iframe falls back to `mint` when `pool` is null.
- **Multiple watched coins with open charts:** Chart iframes are lazy-mounted only for mints in `openCharts` when the user clicks `Show chart`, avoiding background iframe loads.

## Test plan

- `test/ping.test.js` — Verifies `deployerWallets` and `checkExits` include watched mints with `listed = 0`.
- `test/score.test.js` — Verifies watched mints run full vetoes after a cheap veto failure and `watchList` classifies `safe`, `caution`, and `flag` states.
- `test/server.test.js` — Verifies `/api/watch` `GET`/`POST`/`DELETE`, status codes (`200`, `400`, `405`), and VM-rendered `Watch` tab UI including chart `<iframe>` toggle persistence.
- Run command: `node --test`
