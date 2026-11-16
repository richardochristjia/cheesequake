# Cheesequake: Solana memecoin scanner

Tier L. New system in an empty repository (one initial commit, no code).

## Problem

- The user wants a system that finds promising Solana memecoins from real data, modelled on a reference site.
- The reference site is a paid course. It names four pillars (narrative, attention, wallet tracking, risk) and four member tools. It publishes no formulas, weights or cutoffs, and the tools sit behind a login the user does not have.
- An exact copy is impossible. Every threshold in this document is a default of this project, untested until the system has collected history.
- The repository is empty. There is no project record.

## Solution

One local Node 22 program named `cheesequake`, plain JavaScript (ES modules), **zero npm dependencies**. It collects free market and on-chain data on timers, stores it in one SQLite file, and serves a dashboard on `127.0.0.1` with four tabs:

| Tab | Shows |
|---|---|
| Market | "Trench index" 0–100, 30-day chart, zones Cold, Cool, Neutral, Hot, Euphoria |
| Ping | Feed of buys and sells by tracked wallets, consensus alerts, exit alerts |
| Narratives | Hourly themes, "Running now" ranked candidates with score and reasons, "Best calls" wallet scorecard, calibration table |
| Tracer | Fund flow from a start wallet, hop by hop, labelled destinations |

Candidates pass a list of vetoes first. Survivors get a 0–100 score. Missing data is "unknown", never a pass. Every candidate's later price is logged so the score can be checked against outcomes.

This is a research tool. It never signs a transaction and never trades.

## Hard rules

1. **The reference site is never named.** Not in code, comments, documentation, the dashboard, the project record, this folder, branch names, commit messages or the pull request. Refer to it as "the reference site" if it must be mentioned at all.
2. **No npm dependencies.** Node built-ins only: `fetch`, `node:sqlite`, `node:http`, `node:test`, `node:assert`, `node:fs`, `node:path`.
3. **No network in tests.** Every source module takes its `fetch` and its clock as parameters.
4. **Commits** use Conventional Commits (`<type>(<scope>): <summary>`, imperative, lowercase, 72 characters max, types `feat fix docs style refactor perf test build ci chore revert`), one logical change per commit. **No Claude or Anthropic attribution** in commit messages, pull request title or description: no `Co-Authored-By` trailer, no "Generated with" line.
5. **No invented data.** `data/labels.json` ships with no address entries. Do not write exchange or mixer addresses from memory.

## Acceptance Criteria

Checked by the run:

1. `node --test` passes with no network access.
2. From saved responses, the store holds snapshots, and the Trench index is an integer from 0 to 100 with a zone name.
3. Three non-sniper tracked wallets buying one coin inside 60 minutes produce exactly one consensus alert. Two do not.
4. A coin that trips any veto never appears in "Running now", whatever its score.
5. A coin with a missing source answer shows "unknown" and cannot reach the 80–100 band.
6. A sniper wallet's buy does not count toward consensus.
7. A tracked-wallet sell, a deployer sell and a one-third liquidity drop each raise one exit alert.
8. The outcome log stores a candidate's score and its later prices, and the calibration table groups them by band.
9. An HTTP 429 answer is retried after a pause and does not stop the collector.
10. The dashboard serves all four tabs from a seeded database, and the server listens on `127.0.0.1` only.
11. A case-insensitive search of the repository (excluding `.git`) for the reference site's name returns nothing.

Manual:

- `manual:` start the program with a real `wallets.txt`, wait 15 minutes, confirm live coins appear in Narratives and live wallet activity appears in Ping.
- `manual:` enter a known wallet in Tracer and compare the first hop against a block explorer.
- `manual:` after 7 days, confirm the Market tab leaves "warming up" and the 30-day chart draws.

## Dialectical Outcomes (Why)

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Scope | All four tools | Token screener only: user chose the full set |
| Chain | Solana only | Other chains: the reference material points at Solana only |
| Data | Free endpoints, no keys | Paid X, Birdeye, Helius paid tiers: user chose free |
| Social signal | Not an input | Faking attention without X data lowers reliability |
| Wallet list | User-edited text file | Deriving wallets from past winners: heavy history pulls on a free RPC |
| Output | Local web dashboard | CLI or Telegram: user chose dashboard |
| Thresholds | Project defaults in one config file | The reference site's numbers: not published |
| Score shape | Vetoes, then weighted score, bands 80/65/45/25 | Earlier three-part score (attention 40, wallets 35, narrative 25): replaced after the user supplied a checklist framework; its social part was dropped |
| Serial-deployer check | Left out | RugCheck's `creatorTokens` field was empty on both tokens probed, including a pump.fun launch |
| Holder data | RugCheck only | Public RPC `getTokenLargestAccounts` answered 429 |
| Authority check | RugCheck and RPC; either saying "active" means active | Single source: these two vetoes are the most reliable facts available, so they get a second source |
| Stack | Node 22, no dependencies, no build step | Frameworks, TypeScript: nothing here needs them |
| Themes | Keyword groups, no AI model calls | Model-written summaries: cost, and not free to run |

## Relevant Files (Where)

All paths are relative to the repository root. All are new.

| File | Purpose |
|---|---|
| `package.json` | `"type": "module"`, `"bin": {"cheesequake": "src/main.js"}`, scripts `start` and `test`, `"engines": {"node": ">=22.13"}`, no dependencies |
| `.gitignore` | `data/*.db*`, `wallets.txt`, `.lavish/`, `node_modules/` |
| `README.md` | What it is, how to start, `wallets.txt` and `data/labels.json` formats, limits, "not trading advice" |
| `wallets.example.txt` | Format example with placeholder comment lines only |
| `data/labels.json` | `{"labels": []}`; entry shape `{"address","name","type":"exchange"|"mixer"|"other"}` |
| `src/config.js` | Every threshold and interval, each marked as a project default; env overrides |
| `src/db.js` | Opens SQLite, creates tables |
| `src/http.js` | Paced JSON fetch with retry |
| `src/wallets.js` | Reads and validates the wallet file |
| `src/sources/geckoterminal.js` | New pools, trending pools, pool batch |
| `src/sources/dexscreener.js` | Token batch, boosts, profiles |
| `src/sources/rugcheck.js` | Full report, normalised |
| `src/sources/solana.js` | RPC: signatures, transaction, mint info |
| `src/market.js` | Hourly snapshot, Trench index |
| `src/trades.js` | Buy, sell or transfer from one parsed transaction |
| `src/ping.js` | Wallet poller, consensus, exit alerts |
| `src/vetoes.js` | Veto list |
| `src/scorecard.js` | Per-wallet scorecard |
| `src/themes.js` | Keyword themes |
| `src/score.js` | Score, bands, candidate pipeline |
| `src/outcomes.js` | Outcome log, calibration |
| `src/tracer.js` | Fund-flow trace |
| `src/server.js` | HTTP server and JSON API |
| `src/main.js` | Entry point, timers |
| `public/index.html` | Dashboard: one file, inline CSS and JS |
| `test/*.test.js` | One per module (see Test Strategies) |
| `test/fixtures/*.json` | Hand-trimmed API responses in the shapes below |
| `.agents/RECORD.md` | Project record, written in the Verification phase |

## Key Code Context (What)

No code exists yet. The implementation depends on these outside response shapes, all observed by probe on 2026-11-15 with no API key.

**GeckoTerminal** `GET https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1` and `.../trending_pools?page=1`. Blocked (429) after 3 rapid calls.

```json
{"data":[{"id":"solana_<pool>","type":"pool","attributes":{
  "base_token_price_usd":"0.0000014","quote_token_price_usd":"71.95",
  "address":"<pool>","name":"CHAROC / SOL","pool_created_at":"2026-11-15T09:07:34Z",
  "fdv_usd":"3999.79","market_cap_usd":null,
  "price_change_percentage":{"m5":"-9.3","m15":"-9.3","m30":"-9.3","h1":"-9.3","h6":"-9.3","h24":"-9.3"},
  "transactions":{"m5":{"buys":1,"sells":1,"buyers":1,"sellers":1},"h1":{"buys":1,"sells":1,"buyers":1,"sellers":1},"h6":{"buys":1,"sells":1,"buyers":1,"sellers":1},"h24":{"buys":1,"sells":1,"buyers":1,"sellers":1}},
  "volume_usd":{"m5":"6.8","h1":"6.8","h6":"6.8","h24":"6.8"},
  "reserve_in_usd":null},
 "relationships":{"base_token":{"data":{"id":"solana_<mint>"}},"quote_token":{"data":{"id":"solana_So11111111111111111111111111111111111111112"}},"dex":{"data":{"id":"pump-fun"}}}}]}
```

Numbers arrive as strings and may be `null`. `quote_token_price_usd` on a SOL-quoted pool is the SOL price in USD.

**DexScreener** `GET https://api.dexscreener.com/tokens/v1/solana/<mint>[,<mint>...]` (up to 30 mints), `GET https://api.dexscreener.com/token-boosts/top/v1`, `GET https://api.dexscreener.com/token-profiles/latest/v1`.

```json
[{"chainId":"solana","dexId":"orca","pairAddress":"<pool>",
  "baseToken":{"address":"<mint>","name":"Bonk","symbol":"Bonk"},
  "quoteToken":{"address":"So111...","symbol":"SOL"},
  "priceNative":"0.00000003316","priceUsd":"0.000002374",
  "txns":{"m5":{"buys":17,"sells":85},"h1":{"buys":191,"sells":335},"h6":{"buys":1183,"sells":1489},"h24":{"buys":10678,"sells":7777}},
  "volume":{"h24":436314.05,"h6":56802.19,"h1":11284.45,"m5":2057.8},
  "priceChange":{"m5":0.66,"h1":1.3,"h6":1.18,"h24":-8.47},
  "liquidity":{"usd":231932.54,"base":63047299985,"quote":1148.6987},
  "fdv":210992105,"marketCap":208930439,"pairCreatedAt":1671980424000}]
```

Boosts and profiles return `[{"chainId":"solana","tokenAddress":"<mint>","description":"...","links":[...]}]`. Keep `chainId === "solana"` only. A token has several pairs; use the pair with the highest `liquidity.usd`. DexScreener gives trade counts, not unique buyers.

**RugCheck** `GET https://api.rugcheck.xyz/v1/tokens/<mint>/report`. 12 rapid calls all returned 200.

```json
{"mint":"<mint>","creator":"<wallet>","creatorBalance":14608202508,"creatorTokens":null,
 "mintAuthority":null,"freezeAuthority":null,"rugged":false,
 "risks":[{"name":"Mutable metadata","description":"...","score":100,"level":"warn"}],
 "score":101,"score_normalised":7,"totalHolders":2111051,"totalMarketLiquidity":1341270.76,
 "graphInsidersDetected":48,
 "insiderNetworks":[{"id":"...","size":48,"type":"transfer","tokenAmount":28954737171604569,"currentHolding":7606498765833410,"activeAccounts":48}],
 "topHolders":[{"address":"<token account>","owner":"<wallet>","amount":914709517327373143,"decimals":5,"pct":10.39,"uiAmount":9147095173273.73}],
 "knownAccounts":{"<address>":{"name":"...","type":"..."}},
 "launchpad":{"name":"Pump.Fun"},
 "markets":[{"lp":{"lpLockedPct":19.35,"lpLockedUSD":0,"quoteUSD":0,"baseUSD":0}}],
 "token":{},"transferFee":{},"lockers":{}}
```

Observed keys: `creator creatorBalance creatorTokens deployPlatform detectedAt events fileMeta freezeAuthority graphInsidersDetected insiderNetworks knownAccounts launchpad lockerOwners lockerScanStatus lockers markets mint mintAuthority price risks rugged score score_normalised token tokenMeta tokenProgram tokenType token_extensions topHolders totalHolders totalLPProviders totalMarketLiquidity totalStableLiquidity transferFee validation verification`. The inner shapes of `token`, `transferFee` and `knownAccounts` values were not inspected. Read them defensively; a field that is absent or of an unexpected type is "unknown".

**Solana RPC** `POST https://api.mainnet-beta.solana.com`. Blocked (429) after 9 rapid calls. `getTokenLargestAccounts` is refused; do not use it.

- `getSignaturesForAddress [address, {limit, until}]` returns `[{signature, blockTime, err, slot}]`, newest first.
- `getTransaction [signature, {encoding:"jsonParsed", maxSupportedTransactionVersion:0}]` returns `{blockTime, meta:{err, fee, preBalances, postBalances, preTokenBalances, postTokenBalances}, transaction:{message:{accountKeys:[{pubkey, signer}]}}}`. Token balance entries: `{accountIndex, mint, owner, uiTokenAmount:{amount, decimals, uiAmount}}`. `result` can be `null`.
- `getAccountInfo [mint, {encoding:"jsonParsed"}]` returns `value.data.parsed.info = {decimals, supply, mintAuthority, freezeAuthority}`.
- Rate-limit errors arrive as HTTP 429 **or** as HTTP 200 with `{"error":{"code":429}}`. Treat both as 429.

**Node** `node:sqlite` works on 22.22: `import { DatabaseSync } from 'node:sqlite'`, `db.exec(sql)`, `db.prepare(sql).run(...)`, `.get(...)`, `.all(...)`. It prints an `ExperimentalWarning`; leave it.

## Implementation Algorithm (How)

### Config (`src/config.js`)

Export one frozen object. Env overrides: `CHEESEQUAKE_RPC_URL`, `CHEESEQUAKE_PORT` (default 4777), `CHEESEQUAKE_DB` (default `data/cheesequake.db`), `CHEESEQUAKE_WALLETS` (default `wallets.txt`).

| Key | Default |
|---|---|
| `pace.geckoterminal` | 1 call per 3 s |
| `pace.dexscreener` | 1 call per 1 s |
| `pace.rugcheck` | 1 call per 1 s |
| `pace.rpc` | 1 call per 0.5 s |
| `retry` | 4 tries, wait 5 s, 15 s, 45 s |
| `intervals` | new pools 60 s, trending 300 s, candidates 300 s, wallets 60 s, outcomes 300 s |
| `index.windowHours` / `warmupHours` | 720 / 168 |
| `veto.minLiquidityUsd` | 10000 |
| `veto.minAgeMinutes` | 30 |
| `veto.minLpLockedPct` | 80 |
| `veto.maxTop10Pct` | 25 |
| `veto.maxInsiderPct` | 20 |
| `veto.washMinBuyers` / `washVolumeUsd` | 10 / 50000 |
| `consensus.wallets` / `windowMinutes` | 3 / 60 |
| `scorecard.sniperHoldSeconds` / `minHolds` / `ratedTrades` | 300 / 3 / 10 |
| `weights` | wallets 30, health 25, deployer 15, liquidity 15, momentum 10, narrative 5 |
| `bands` | 80 strong, 65 confirm, 45 neutral, 25 risk, 0 avoid |
| `unknownCap` | 79 |
| `exit.liquidityDropShare` | 0.33 |
| `outcome.horizonsHours` | 1, 6, 24 |
| `tracer` | depth 4, 10 signatures per wallet, top 2 destinations, cache 24 h |
| `theme.minTokens` | 3 |

### Store (`src/db.js`)

`openDb(path)` creates the parent folder, opens the file, runs `CREATE TABLE IF NOT EXISTS` for:

- `pool_snapshots(ts, source, pool, mint, symbol, name, dex, created_at, price_usd, fdv_usd, mcap_usd, liquidity_usd, vol_h1, vol_h6, vol_h24, buys_h1, sells_h1, buyers_h1, buyers_h6, chg_h1)` with an index on `(mint, ts)`. `source` is `new`, `trending` or `candidate`.
- `tokens(mint PRIMARY KEY, symbol, name, description, creator, first_seen)`
- `market_samples(ts, launch_rate, active_share)`
- `market_hourly(hour PRIMARY KEY, launch_rate, active_share, trending_vol, buy_sell_ratio, median_chg, index_value, zone)`
- `wallet_cursor(address PRIMARY KEY, last_sig)`
- `trades(sig, wallet, mint, side, token_amount, quote_usd, ts, PRIMARY KEY(sig, wallet, mint))`. `side` is `buy`, `sell` or `out` (transfer out).
- `alerts(id INTEGER PRIMARY KEY, ts, kind, mint, wallet, detail, dedupe UNIQUE)`
- `reports(mint PRIMARY KEY, ts, json)`
- `candidates(id INTEGER PRIMARY KEY, ts, mint, score, band, listed, vetoes, reasons, unknowns, price_usd, mcap_usd)`
- `outcomes(candidate_id, horizon_h, due_ts, price_usd, status, PRIMARY KEY(candidate_id, horizon_h))`. `status` is `due`, `done` or `missed`.
- `theme_hourly(hour, keyword, tokens, volume, share, PRIMARY KEY(hour, keyword))`
- `token_theme(mint PRIMARY KEY, keyword, hour)`
- `trace_cache(start PRIMARY KEY, ts, status, json)`

Timestamps are Unix seconds. JSON columns are text.

### Paced fetch (`src/http.js`)

`createClient({fetch, sleep, now, minGapMs, retry})` returns `getJson(url, init)`. One client per host. Calls are serialised through a promise chain so that two calls never start less than `minGapMs` apart. On HTTP 429, HTTP 5xx, a network error, or a JSON body with `error.code === 429`, wait and retry per `retry`. After the last try, throw an `Error` with `code = 'SOURCE_UNAVAILABLE'`. Callers catch it and record "unknown"; a failed source never stops a timer.

### Wallet file (`src/wallets.js`)

One wallet per line: `<address>[,<label>]`. `#` starts a comment. Blank lines are skipped. An address is valid when it matches `^[1-9A-HJ-NP-Za-km-z]{32,44}$`. An invalid line is skipped with one warning on stderr naming the line number. Duplicates keep the first. A missing file gives an empty list and one warning. The file is re-read on every wallet cycle.

### Market and Trench index (`src/market.js`)

Every 60 s: fetch new pools page 1 (20 pools), store snapshots (`source = new`), then store one `market_samples` row:

- `launch_rate` = pools per minute = `count / ((newest created_at − oldest created_at) / 60)`. Skip the sample when the span is 0. A plain count would saturate at 20, which is why the rate is derived from the time span.
- `active_share` = share of those pools with `transactions.h1.buyers >= 10`.

Every 300 s: fetch trending pools page 1, store snapshots (`source = trending`), upsert `tokens`.

At each hour boundary, write `market_hourly` for the hour that ended:

- `launch_rate`, `active_share`: median of that hour's samples.
- `trending_vol`: sum of `vol_h1` over the latest trending snapshot set.
- `buy_sell_ratio`: sum of `buys_h1` / sum of `sells_h1` (0 sells gives the buy count).
- `median_chg`: median of `chg_h1`.

`trenchIndex(rows)`: `rows` are the last 720 hourly rows, newest last. With fewer than 168 rows, return `{value: null, zone: 'warming up'}`. Otherwise, for each of the five components, percentile = share of rows whose value is less than or equal to the newest value. `value = round(mean(percentiles) × 100)`. A component that is `null` in the newest row is left out of the mean; if all five are `null`, return warming up. Zone: under 20 Cold, under 40 Cool, under 60 Neutral, under 80 Hot, else Euphoria.

### Trade detection (`src/trades.js`)

`classify(tx, wallet, solUsd)` returns a list of `{mint, side, tokenAmount, quoteUsd}`.

1. If `tx` is `null` or `tx.meta.err` is set, return an empty list.
2. Quote mints: wrapped SOL `So11111111111111111111111111111111111111112`, USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, USDT `Es9vMFrzaCERmJfrF4H2FYD4KNYQNR4KSB7QQ3xAPbmN`.
3. Token delta per mint = sum of post `uiAmount` minus sum of pre `uiAmount` over entries where `owner === wallet`. A missing entry counts as 0.
4. Native SOL delta = `(postBalances[i] − preBalances[i]) / 1e9` at the wallet's index in `accountKeys`; add `fee / 1e9` back when the wallet is index 0 (fee payer).
5. `quoteUsd` = (native SOL delta + wrapped SOL delta) × `solUsd` + USDC delta + USDT delta.
6. For each non-quote mint with a non-zero delta: delta > 0 and `quoteUsd < −0.5` is a `buy`; delta < 0 and `quoteUsd > 0.5` is a `sell`; delta < 0 otherwise is `out`; delta > 0 otherwise is ignored (airdrop or transfer in).
7. When one transaction moves several non-quote mints, split `|quoteUsd|` evenly across them.

### Ping (`src/ping.js`)

Poll set = wallets from the file, plus deployers (`tokens.creator`) of the 20 highest-scoring candidates listed in the last 24 h. Guidance in the README: about 40 wallets on the public RPC.

Per wallet, each cycle:

1. No cursor: call `getSignaturesForAddress` with `limit: 1`, store that signature as the cursor, stop. No backfill.
2. Cursor present: call with `limit: 20, until: cursor`. For each signature oldest first, `getTransaction`, `classify`, insert `trades` (ignore duplicates), advance the cursor after each.
3. A tracked wallet's `buy` or `sell` inserts an alert of kind `buy` or `sell`, dedupe `<kind>:<sig>:<mint>`.

Consensus, on each new tracked-wallet buy of mint M at time T: count distinct tracked wallets, excluding snipers and excluding deployer-only wallets, with a buy of M in `[T − 60 min, T]`. If the count is at least 3 and no `consensus` alert for M exists in the last 60 minutes, insert one. Detail holds the wallet list and market cap.

Exit alerts, for mints listed as candidates in the last 24 h, dedupe `<kind>:<mint>:<wallet or ''>:<hour>`:

- `exit_wallet`: a tracked wallet `sell`.
- `exit_deployer`: the deployer's `sell` or `out`.
- `exit_liquidity`: latest `liquidity_usd` is at most 67% of the snapshot nearest to one hour earlier.
- `exit_divergence`: `vol_h1` above the value one hour earlier while `buyers_h1` is below it.

### Vetoes (`src/vetoes.js`)

`evaluate({market, report, mintInfo, now})` returns `{vetoes: [name], unknowns: [name]}`. `market` is the token's best snapshot, `report` the RugCheck report or `null`, `mintInfo` the RPC mint info or `null`.

| Name | Vetoed when | Unknown when |
|---|---|---|
| `mint_authority` | RugCheck or RPC shows a non-null mint authority | both sources missing |
| `freeze_authority` | RugCheck or RPC shows a non-null freeze authority | both sources missing |
| `rugged` | `report.rugged === true` or any `risks[].level === 'danger'` | report missing |
| `transfer_fee` | `report.transferFee.pct > 0` | report missing |
| `lp_unlocked` | highest-liquidity market's `lp.lpLockedPct < 80`; skipped when the main pool's dex id is `pumpfun` or `pump-fun` (bonding curve, not yet graduated) | report missing or no `lp` |
| `top10` | sum of `pct` of the first 10 `topHolders` whose `address` and `owner` are not keys of `knownAccounts` is over 25 | report missing or no `topHolders` |
| `insiders` | sum of `insiderNetworks[].currentHolding` / mint supply × 100 is over 20; supply from RPC mint info, else `report.token.supply` | report missing, or supply missing while networks exist |
| `liquidity` | `liquidity_usd < 10000` | liquidity `null` |
| `age` | pool age under 30 minutes | `created_at` missing |
| `wash` | (`vol_h1 > 1.5 × vol_h6 / 6` and `buyers_h1 < buyers_h6 / 6`) or (`buyers_h1 < 10` and `vol_h1 > 50000`) | buyers missing |

A mismatch between the two authority sources counts as active.

### Wallet scorecard (`src/scorecard.js`)

`scorecard(trades)` for one wallet, grouped by mint:

- `bought` = mints with at least one buy.
- `hold` per mint = first sell ts − first buy ts, for mints with both.
- `win` per mint with a sell = total sell `quote_usd` ≥ total buy `quote_usd` × (tokens sold / tokens bought, capped at 1).
- `winRate` = wins / mints with a sell, or `null`.
- `medianHoldSeconds` = median of holds, or `null`.
- `stillHoldingShare` = mints with net tokens > 0 / `bought`.
- `class`: `sniper` when there are at least 3 holds and the median is under 300 s; else `unrated` when `bought < 10`; else `rated`.
- `weight`: sniper 0, unrated 0.5, rated 1.

### Themes (`src/themes.js`)

Each hour, over tokens in the latest trending set plus current candidates: lower-case `name + symbol + description`, split on non-alphanumerics, drop words under 3 characters and a stop list (`the and for coin token sol solana official meme pump fun inu new with you your from this that`), dedupe per token. A keyword carried by at least 3 distinct tokens is a theme. Store `theme_hourly` with token count, summed `vol_h1`, and `share` = theme volume / total volume of the set. A token's theme is its keyword with the most tokens (ties: higher volume).

### Score and candidates (`src/score.js`)

Every 300 s:

1. Universe = mints in the latest trending set, Solana mints from boosts and profiles, and mints bought by tracked wallets in the last 24 h. Cap at 60, tracked-wallet mints first.
2. DexScreener token batch (30 per call) for price, liquidity, market cap, counts, age. Best pair by liquidity.
3. Unique buyers: from the trending snapshot when the token is there; otherwise GeckoTerminal `GET /networks/solana/pools/multi/<pool addresses>` with the DexScreener `pairAddress` (this endpoint was **not** probed; if it fails or the shape differs, buyers are "unknown"). Store a `candidate` snapshot.
4. Cheap vetoes first: `liquidity`, `age`, `wash`. A vetoed token gets a `candidates` row with `listed = 0` and no further calls.
5. RugCheck report (reuse a stored one younger than 10 minutes) and RPC mint info. Store `tokens.creator`.
6. Remaining vetoes. Vetoed: `listed = 0`.
7. Score, each part in 0–1, times its weight, summed and rounded:

   - **Wallets (30):** `q` = sum of scorecard weights of tracked wallets with a buy of the mint in the last 24 h and net tokens > 0. Part = `min(1, (q + (consensus alert in last 24 h ? 1 : 0)) / 4)`.
   - **On-chain health (25):** mean of `clamp((buyers_h1 / (buyers_h6 / 6) − 0.5) / 1.5)`, `clamp((buys_h1 / (buys_h1 + sells_h1) − 0.4) / 0.3)`, `clamp((25 − top10pct) / 25)`. Any input missing: part 0, unknown `health`.
   - **Deployer (15):** `exit_deployer` alert in the last 24 h gives 0; else `creatorBalance > 0` gives 1; else 0.5. No creator: part 0, unknown `deployer`.
   - **Liquidity (15):** mean of `clamp((liquidity_usd / mcap_usd) / 0.10)` and `lpLockedPct / 100`; bonding-curve tokens use the first term only. Missing: part 0, unknown `liquidity`.
   - **Momentum (10):** `clamp((vol_h1 / (vol_h6 / 6) − 1) / 2)`. Missing: part 0, unknown `momentum`.
   - **Narrative (5):** theme share above the previous hour's gives 1; in a theme otherwise gives 0.5; no theme gives 0.

   `clamp` limits to 0–1. A zero denominator makes that input missing.
8. If `unknowns` (from vetoes or parts) is not empty, `score = min(score, 79)`.
9. Band from `bands`. `reasons` is a list of `{part, points, max, note}` in plain words.
10. Insert a `candidates` row with `listed = 1`.

"Running now" = the latest `listed = 1` row per mint from the last 30 minutes, ordered by score.

### Outcome log (`src/outcomes.js`)

When a mint gets a `listed = 1` row and has had none in the previous 24 h, insert three `outcomes` rows (`status = due`) at +1 h, +6 h, +24 h for that candidate id. Every 300 s, take rows with `due_ts <= now` and `status = due`, fetch prices in DexScreener batches, set `price_usd` and `status = done`. A row still unpriced one hour past due becomes `missed`.

`calibration(db)` returns, per band and horizon: count, mean percentage change from the candidate's `price_usd`, share with a positive change. `missed` rows are left out and counted separately.

### Tracer (`src/tracer.js`)

`startTrace(wallet)`: return the cached result when younger than 24 h; otherwise set `trace_cache.status = running` and run in the background.

Breadth-first from the start wallet, depth 4. Per wallet: `getSignaturesForAddress limit 10`, `getTransaction` each. For each transaction, outgoing value from this wallet in USD = decrease in native SOL, wrapped SOL (× SOL price), USDC and USDT. Destination = the account with the largest matching increase in the same transaction. Sum by destination, keep the top 2. A destination found in `data/labels.json` is recorded with its label and not expanded. A wallet already visited is not expanded. Result: `{nodes: [{address, label, type, depth}], edges: [{from, to, usd, txCount}]}`. Worst case 15 wallets, about 165 RPC calls, about 90 seconds. A source failure ends the trace with `status = partial` and keeps what was found.

### Server (`src/server.js`)

`createServer({db, config, tracer})` on `node:http`, `listen(port, '127.0.0.1')`. GET only; anything else is 405.

| Route | Returns |
|---|---|
| `/` | `public/index.html` |
| `/api/market` | `{index: {value, zone}, hourly: [last 720 rows]}` |
| `/api/ping?kind=` | latest 200 alerts, optional kind filter (`buy sell consensus exit`) |
| `/api/narratives` | `{themes, running, wallets: [scorecards], calibration}` |
| `/api/tracer?wallet=` | 400 on an invalid address; else `{status, nodes, edges}` |

All SQL uses bound parameters. Unknown paths are 404. No file serving beyond the one page.

### Dashboard (`public/index.html`)

One file, inline CSS and JS, no outside scripts or fonts. Four tabs, header "Cheesequake", a "not trading advice" line. Polls the API every 30 s. Market: index value, zone, an inline SVG line of the last 30 days, or "warming up". Ping: alert list with kind filter. Narratives: themes table, Running now table (coin, theme, score, band, market cap, wallets in, unknowns, reasons on expand), wallet scorecard table, calibration table. Tracer: address input, status, an inline SVG graph by depth column, labelled nodes coloured by type.

**Every value from the API is written with `textContent`**, never `innerHTML`: token names and descriptions are attacker-controlled. Explorer links are built only from addresses that match the base58 pattern.

### Entry point (`src/main.js`)

Shebang `#!/usr/bin/env node`. Opens the store, builds one client per host, starts the server, prints the dashboard address, starts the timers. Each timer body is wrapped so that a thrown error is logged and the timer carries on. A cycle still running when its timer fires again is skipped. `SIGINT` closes the server and the store.

## Phases

1. **Base.** `package.json`, `.gitignore`, `src/config.js`, `src/db.js`, `src/http.js`, `src/wallets.js`, `wallets.example.txt`.
2. **Market.** The three market source modules, `src/market.js`, fixtures for new pools, trending pools, token batch.
3. **Ping.** `src/sources/solana.js`, `src/trades.js`, `src/ping.js` with buy and sell alerts and consensus.
4. **Vetoes.** `src/sources/rugcheck.js`, `src/vetoes.js`, authority cross-check, "unknown" handling.
5. **Wallet scorecard and exits.** `src/scorecard.js`; sniper exclusion wired into consensus; deployer watch; the four exit alerts.
6. **Narratives.** `src/themes.js`, `src/score.js` with the candidate pipeline and reasons.
7. **Outcome log.** `src/outcomes.js`, calibration.
8. **Tracer.** `src/tracer.js`, `data/labels.json`.
9. **Dashboard.** `src/server.js`, `public/index.html`, `src/main.js`, `README.md`.

## Anti-Goals (Out of Scope)

- Cross-exchange charts: order book heatmap, CVD, open interest.
- X, Telegram or caller data. Social data is not an input.
- Buying, selling, wallet signing, private keys.
- Chains other than Solana.
- Login, hosting, multiple users, binding to any address but `127.0.0.1`.
- Serial-deployer history.
- A 12-month seasonal view of the index.
- AI model calls.
- Backfilling wallet history.
- npm dependencies, a build step, TypeScript.
- A browser test fixture (`.harness/`). None exists, so the browser walkthrough is skipped.

## Edge Cases & Gotchas

- GeckoTerminal numbers are strings or `null`. Parse with a helper that returns `null`, never `NaN` and never 0, for missing values.
- Most new pools are pump.fun dust with `reserve_in_usd: null`. They feed the index only; candidates come from trending, boosts, profiles and tracked-wallet buys.
- The public RPC signals rate limits inside a 200 response. Check `error.code`.
- `getTransaction` can return `null` for a fresh signature. Skip it without advancing the cursor past it; retry next cycle, and give up on a signature after 3 cycles.
- A wallet's first cycle only sets the cursor. Without this, 40 wallets × 20 transactions would exhaust the rate limit at start.
- A token transfer in with no payment is not a buy (test 6).
- Deployers of pump.fun tokens often hold 0 right after launch. That scores 0.5, not 0; only an observed sell or transfer out scores 0.
- Bonding-curve tokens have no LP to lock. The `lp_unlocked` veto is skipped for them and only for them.
- Token names, symbols and descriptions are hostile input: `textContent` only, bound SQL parameters only.
- Consensus must fire once per mint per hour even when a fourth and fifth wallet buy.
- A source outage must surface as "unknown", cap the score at 79, and never crash a timer.
- `node:sqlite` returns `BigInt` only when asked; keep token amounts as JS numbers from `uiAmount`, and never store raw `amount` strings as integers.
- Tests must not open `data/cheesequake.db`; use `:memory:`.
- The reference site's name must not appear anywhere, including fixture file names and test descriptions.

## Navigation Anchors

- `src/main.js`: start here; shows every timer and what it calls.
- `src/score.js` `runCandidates()`: the candidate pipeline end to end.
- `src/vetoes.js` `evaluate()`: every drop rule.
- `src/ping.js` `pollWallet()` and `checkConsensus()`.
- `src/market.js` `trenchIndex()`.
- `src/config.js`: every number.

## Dependency Mappings

No external libraries.

| Module | Uses |
|---|---|
| `main` | `config`, `db`, `http`, `wallets`, all sources, `market`, `ping`, `score`, `outcomes`, `tracer`, `server` |
| `score` | `vetoes`, `scorecard`, `themes`, `outcomes`, `dexscreener`, `geckoterminal`, `rugcheck`, `solana` |
| `ping` | `trades`, `scorecard`, `solana` |
| `market` | `geckoterminal` |
| `tracer` | `solana`, `data/labels.json` |
| `server` | `market`, `scorecard`, `outcomes`, `tracer` |
| sources | `http` |

Outside services: GeckoTerminal, DexScreener, RugCheck, a Solana RPC endpoint.

## Test Strategies

Run with `node --test`. Each source and timer function takes `{fetch, now, sleep, db}` so tests pass fakes. Fixtures are hand-trimmed JSON in the shapes above, with made-up addresses that match the base58 pattern.

| # | Phase | File | Case | Input | Expected |
|---|---|---|---|---|---|
| 1 | 2 | `market.test.js` | Parse new pools | New-pools fixture | Rows with address, age, volume, buyers; `null` kept as `null` |
| 2 | 1 | `http.test.js` | Rate limit | 429, then 200; also 200 with `error.code 429`, then 200 | One retry after the pause each, data returned |
| 3 | 2 | `market.test.js` | Index range | 720 seeded hourly rows | Integer 0–100, correct zone |
| 4 | 2 | `market.test.js` | Index warm-up | 48 hourly rows | `value: null`, "warming up" |
| 5 | 3 | `trades.test.js` | Buy detection | Token up, SOL down | One buy |
| 6 | 3 | `trades.test.js` | Plain transfer | Token up, SOL unchanged | Nothing recorded |
| 7 | 3 | `ping.test.js` | Consensus fires | 3 wallets, one coin, 40 minutes; then a 4th | Exactly one consensus alert |
| 8 | 3 | `ping.test.js` | Consensus holds | 3 wallets, 3 hours apart; and 2 wallets | No consensus alert |
| 9 | 4 | `vetoes.test.js` | Each veto | One input per row of the veto table | That veto name returned |
| 10 | 6 | `score.test.js` | Score order | Two coins, one with consensus | Consensus coin scores higher |
| 11 | 6 | `themes.test.js` | Theme grouping | Five tokens, three share a keyword | One theme with three tokens |
| 12 | 8 | `tracer.test.js` | Tracer depth | Chain of 6 transfers; a labelled address at hop 2 on another branch | Stops at depth 4; labelled node not expanded |
| 13 | 1 | `wallets.test.js` | Bad wallet line | Invalid address, comment, duplicate | Bad line skipped with a warning, others load |
| 14 | 9 | `server.test.js` | Dashboard | Seeded `:memory:` store | Four API routes return data; `/` returns the page; bound host is `127.0.0.1`; bad tracer address is 400 |
| 15 | 6 | `score.test.js` | Veto beats score | Consensus plus active mint authority | `listed = 0` |
| 16 | 4 | `vetoes.test.js` | Authority mismatch | RugCheck revoked, RPC active | `mint_authority` vetoed |
| 17 | 6 | `score.test.js` | Unknown field | RugCheck throws `SOURCE_UNAVAILABLE` | Unknowns listed, score at most 79, no crash |
| 18 | 4 | `vetoes.test.js` | Bonding-curve exempt | `pump-fun` pool, 0% locked | No `lp_unlocked`; other vetoes still apply |
| 19 | 5 | `ping.test.js` | Sniper excluded | 3 buyers, one a sniper | No consensus alert |
| 20 | 5 | `scorecard.test.js` | Unrated wallet | 4 mints bought | `unrated`, weight 0.5 |
| 21 | 5 | `ping.test.js` | Exit alerts | Tracked sell, deployer sell, liquidity down 40% in an hour | One alert of each kind; a repeat in the same hour adds none |
| 22 | 7 | `outcomes.test.js` | Outcome log | Candidate at 82, prices at 1, 6, 24 h | Three `done` rows; one entry in the 80–100 band per horizon |
| 23 | 9 | `server.test.js` | Hostile name | Token named `<img src=x onerror=1>` | Page source contains no `innerHTML` assignment; API returns the name as a JSON string |
| 24 | 3 | `ping.test.js` | First cycle | Wallet with no cursor | Cursor set, no `getTransaction` calls |

Criterion 11 is checked with `grep -ril` over the repository, excluding `.git`.

## Record Updates

Written in the Verification phase, after the implementation is reviewed. Create `.agents/RECORD.md` with `~/.claude/skills/forge/record-preamble.md` as its body, copied verbatim, followed by:

```
- (scope) The scanner currently covers Solana tokens only.
- (data) Market data currently comes from GeckoTerminal, DexScreener and RugCheck without API keys.
- (data) Wallet activity is read from a Solana RPC endpoint whose address is a config setting.
- (store) The scanner persists snapshots, wallet events and alerts to one local SQLite file.
- (wallets) Tracked wallets are read from a user-edited text file.
- (wallets) Each tracked wallet currently carries a scorecard computed from its own recorded trades.
- (ping) A consensus alert is raised when at least three non-sniper tracked wallets buy the same token within sixty minutes.
- (ping) Exit alerts are raised for listed tokens on tracked-wallet sells, deployer sells and sharp liquidity drops.
- (score) A token that trips any veto is excluded from candidates regardless of its score.
- (score) A missing source answer is recorded as unknown and never counts as a pass.
- (score) Social media data is currently not an input to the score.
- (score) Scoring thresholds are project defaults held in one config file.
- (outcome) The scanner persists each candidate's score and its later prices to the outcome log.
- (dashboard) The dashboard is served on 127.0.0.1 without login.
- (trading) The scanner never signs transactions or places trades.
```

## Risks

- Scores are unvalidated; the outcome log is the only check, and it needs weeks of data.
- Candidate quality depends on the wallets the user supplies. With an empty wallet file the wallets part is 0 for every coin.
- Free endpoints can change limits or shapes without notice. Affected fields become "unknown".
- Holder, insider and lock data come from RugCheck alone.
- The GeckoTerminal pool-batch endpoint and the inner shapes of `transferFee`, `token` and `knownAccounts` were not probed.
- `data/labels.json` ships empty, so Tracer labels nothing until the user adds addresses.
- Keyword themes are crude.

## Divergence

- Consensus (spec: buys in `[T - 60 min, T]`): `checkConsensus` reads buys in `[T - 60, T + 60]` and fires when any 60-minute span holds three distinct eligible wallets, so a buy polled out of time order still counts. Fewer false negatives; the same "three wallets inside 60 minutes" rule.
