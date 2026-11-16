# Context pack

BASE: main (branch `cheesequake`)
CHANGED: 41 files, +1976/-0 (all new; the repo had no code). Spec: `.plans/cheesequake/plan.md`; known risks: `.plans/cheesequake/risks.md`.

## What this change does
Cheesequake: a zero-dependency Node 22 ES-module program that polls free Solana market/on-chain APIs on timers, stores them in one SQLite file (`node:sqlite`), and serves a 4-tab dashboard (Market, Ping, Narratives, Tracer) on 127.0.0.1. Candidates pass vetoes, then get a 0-100 score; missing data is "unknown" and caps the score at 79. Research tool only; never signs or trades.

## Files
- `package.json:1` ESM, `bin`, scripts `start`/`test`, no deps. `.gitignore`, `README.md`, `wallets.example.txt`, `data/labels.json` (empty `labels`).
- `src/config.js:5` frozen config, every threshold; `bandOf` at :30.
- `src/db.js:23` `openDb` creates all tables.
- `src/http.js:2` `createClient` paced fetch with retry; throws `SOURCE_UNAVAILABLE`.
- `src/wallets.js:6` `loadWallets`, `B58` regex at :3.
- `src/sources/{geckoterminal,dexscreener,rugcheck,solana}.js` parsers/fetchers: `parsePool:10`, `poolsMulti:44`, `parsePair:5`, `tokenBatch:29`, `normalise:9`, `createRpc:2`.
- `src/market.js` `trenchIndex:59`, `rollHourly:78`, `sampleNewPools:29`, `snapTrending:46`.
- `src/trades.js` `classify:26` (buy/sell/out from one parsed tx).
- `src/ping.js` `pollWallet:13`, `checkConsensus:50`, `runWalletCycle:62`, `checkExits:84`.
- `src/vetoes.js` `evaluate:56`, `CHEAP:53`; `src/scorecard.js` `scorecard:12`; `src/themes.js` `groupThemes:11`, `runThemes:32`.
- `src/score.js` `scoreParts:14`, `capScore:51`, `runCandidates:81` (pipeline), `runningNow:150`.
- `src/outcomes.js` `scheduleOutcomes:5`, `fillOutcomes:14`, `calibration:34`.
- `src/tracer.js` `runTrace:26`, `startTrace:68`, `getTrace:80`.
- `src/server.js` `createServer:12`, `startServer:63`; `src/main.js` entry and timers; `public/index.html` dashboard (inline CSS/JS).
- `test/*.test.js` one per module plus `test/helpers.js`, `test/fixtures/{new_pools,token_batch,trending_pools}.json`.

## API contracts
External (no keys): GeckoTerminal `new_pools`, `trending_pools`, `pools/multi/<addrs>` (`src/sources/geckoterminal.js:10,41-44`); DexScreener `tokens/v1/solana/<mints>`, `token-boosts/top/v1`, `token-profiles/latest/v1` (`dexscreener.js:5,29,49`); RugCheck `/v1/tokens/<mint>/report` (`rugcheck.js:9`); Solana RPC `getSignaturesForAddress`, `getTransaction`, `getAccountInfo` (`solana.js:2`). Rate limits arrive as HTTP 429 or HTTP 200 with `error.code 429`; both retry (`http.js:2`).
Local, GET only, else 405 (`src/server.js:12`): `/`, `/api/market`, `/api/ping?kind=`, `/api/narratives`, `/api/tracer?wallet=` (400 on invalid address). Wallet validity: `src/wallets.js:3`.

## Test entry points
- All: `node --test` (no network; `:memory:` DB). One file: `node --test test/<name>.test.js`.
- Module to test: market, http, wallets, trades, ping, vetoes, scorecard, themes, score, outcomes, tracer, server (each `test/<module>.test.js`).

## Acceptance criteria
1. `node --test` passes with no network access.
2. From saved responses, the store holds snapshots, and the Trench index is an integer from 0 to 100 with a zone name.
3. Three non-sniper tracked wallets buying one coin inside 60 minutes produce exactly one consensus alert. Two do not.
4. A coin that trips any veto never appears in "Running now", whatever its score.
5. A coin with a missing source answer shows "unknown" and cannot reach the 80-100 band.
6. A sniper wallet's buy does not count toward consensus.
7. A tracked-wallet sell, a deployer sell and a one-third liquidity drop each raise one exit alert.
8. The outcome log stores a candidate's score and its later prices, and the calibration table groups them by band.
9. An HTTP 429 answer is retried after a pause and does not stop the collector.
10. The dashboard serves all four tabs from a seeded database, and the server listens on `127.0.0.1` only.
11. A case-insensitive search of the repository (excluding `.git`) for the reference site's name returns nothing.
- manual: start with a real `wallets.txt`, wait 15 min, confirm live coins in Narratives and wallet activity in Ping (needs live APIs).
- manual: enter a known wallet in Tracer and compare the first hop against a block explorer.
- manual: after 7 days the Market tab leaves "warming up" and the 30-day chart draws.

## Do not re-derive
- Hard rules (plan.md:27-33): no npm deps; fetch/clock injected so tests use no network; `public/index.html` writes API values with `textContent` only (test 23); `data/labels.json` has no address entries; no Claude/Anthropic attribution in commits or PR; the reference site is never named (criterion 11 needs the name, which the pack deliberately does not hold).
- Thresholds are project defaults in `src/config.js`, not copied from anywhere. Weights: wallets 30, health 25, deployer 15, liquidity 15, momentum 10, narrative 5; bands 80/65/45/25; `unknownCap` 79.
- Bonding-curve (`pump-fun`/`pumpfun`) pools skip only the `lp_unlocked` veto (`src/vetoes.js:4`).
- A wallet's first poll only stores a cursor (`src/ping.js:13`); no backfill.
- Known, accepted gaps (risks.md): `poolsMulti` shape and RugCheck `transferFee.pct`/`token.supply`/`knownAccounts` inner shapes are unprobed guesses; exit liquidity drops shorter than the 5-min snapshot gap can be missed; wallet cycle skips until a SOL price is seen (`src/main.js`); labels ship empty. Phases 6/7 committed outcomes first because `score.js` imports `outcomes.js`.
- Unrelated: `.plans/` is untracked planning material, not part of the product.

## Diff
Omitted: 2,222 diff lines exceeds the 3,000-token budget. The change is entirely new files, so open the file named above; list with `git diff main...HEAD --stat`, full text with `git diff main...HEAD -- src/<file>` (groups: `src/sources/`, `src/*.js`, `public/`, `test/`).
