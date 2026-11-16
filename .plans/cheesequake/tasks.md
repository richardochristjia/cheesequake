# Cheesequake tasks

## Base
- [x] Add `package.json` (ES modules, `cheesequake` bin, `start` and `test` scripts, no dependencies) and `.gitignore`
- [x] Add `src/config.js` with every default from the spec's config table and the four env overrides
- [x] Add `src/db.js` with `openDb()` and all tables
- [x] Add `src/http.js` paced client with retry on 429, 5xx, network error and in-body `error.code 429`
- [x] Add `src/wallets.js` and `wallets.example.txt`
- [x] Add `test/http.test.js` (case 2) and `test/wallets.test.js` (case 13)

## Market
- [x] Add `src/sources/geckoterminal.js` (new pools, trending pools, pool batch) with a null-safe number parser
- [x] Add `src/sources/dexscreener.js` (token batch, boosts, profiles; Solana only; best pair by liquidity)
- [x] Add `src/market.js`: 60 s samples, 300 s trending snapshots, hourly row, `trenchIndex()`
- [x] Add fixtures and `test/market.test.js` (cases 1, 3, 4)

## Ping
- [x] Add `src/sources/solana.js` (signatures, transaction, mint info)
- [x] Add `src/trades.js` `classify()`
- [x] Add `src/ping.js`: wallet poller with cursor, buy and sell alerts, consensus
- [x] Add `test/trades.test.js` (cases 5, 6) and `test/ping.test.js` (cases 7, 8, 24)

## Vetoes
- [x] Add `src/sources/rugcheck.js` (full report, defensive reads)
- [x] Add `src/vetoes.js` `evaluate()` with the ten vetoes, authority cross-check and unknowns
- [x] Add `test/vetoes.test.js` (cases 9, 16, 18)

## Wallet scorecard and exits
- [x] Add `src/scorecard.js`
- [x] Exclude snipers from consensus in `src/ping.js`
- [x] Add deployers of the top 20 candidates to the poll set
- [x] Add the four exit alerts with hourly dedupe
- [x] Add `test/scorecard.test.js` (case 20) and extend `test/ping.test.js` (cases 19, 21)

## Narratives
- [x] Add `src/themes.js`
- [x] Add `src/score.js`: universe, cheap vetoes, report and mint info, remaining vetoes, six score parts, unknown cap, bands, reasons
- [x] Add `test/themes.test.js` (case 11) and `test/score.test.js` (cases 10, 15, 17)

## Outcome log
- [x] Add `src/outcomes.js`: schedule rows on first listing, fill due rows, mark missed, `calibration()`
- [x] Add `test/outcomes.test.js` (case 22)

## Tracer
- [x] Add `data/labels.json` with an empty list
- [x] Add `src/tracer.js`: breadth-first trace, labels, cache, partial result on source failure
- [x] Add `test/tracer.test.js` (case 12)

## Dashboard
- [x] Add `src/server.js` with the five routes, bound to `127.0.0.1`
- [x] Add `public/index.html` with four tabs, `textContent` only
- [x] Add `src/main.js` with guarded timers and clean shutdown
- [x] Add `README.md`
- [x] Add `test/server.test.js` (cases 14, 23)

## Verification
- [x] `node --test` passes with no network access
- [x] From saved responses, the store holds snapshots and the Trench index is an integer from 0 to 100 with a zone name
- [x] Three non-sniper tracked wallets buying one coin inside 60 minutes produce exactly one consensus alert; two do not
- [x] A coin that trips any veto never appears in "Running now", whatever its score
- [x] A coin with a missing source answer shows "unknown" and cannot reach the 80–100 band
- [x] A sniper wallet's buy does not count toward consensus
- [x] A tracked-wallet sell, a deployer sell and a one-third liquidity drop each raise one exit alert
- [x] The outcome log stores a candidate's score and its later prices, and the calibration table groups them by band
- [x] An HTTP 429 answer is retried after a pause and does not stop the collector
- [x] The dashboard serves all four tabs from a seeded database, and the server listens on `127.0.0.1` only
- [x] A case-insensitive search of the repository, excluding `.git`, for the reference site's name returns nothing
- [x] No commit message, pull request title or description carries Claude or Anthropic attribution, and every commit follows Conventional Commits
- [x] Record Updates: (1) review the complete implementation; (2a) if it matches the planned Record Updates in `plan.md`, create `.agents/RECORD.md` from `~/.claude/skills/forge/record-preamble.md` copied verbatim, followed by those exact entries; (2b) if the implementation diverged from a planned entry, do not write a wrong entry: leave it out and surface the divergence in the final implementation summary for the user to resolve

## Manual checks
- [ ] manual: start the program with a real `wallets.txt`, wait 15 minutes, confirm live coins appear in Narratives and live wallet activity appears in Ping
- [ ] manual: enter a known wallet in Tracer and compare the first hop against a block explorer
- [ ] manual: after 7 days, confirm the Market tab leaves "warming up" and the 30-day chart draws
