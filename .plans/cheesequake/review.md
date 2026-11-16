# Review: cheesequake (git diff main...HEAD, 41 files)

Method: interrogate skill, four angles (correctness, security, structure, tests) run by the lead reader inline, not by four spawned agents. Every reviewer input was `.plans/cheesequake/context-pack.md` first (cited below as "pack"), then `plan.md`. Proof probes live in the scratchpad (`p1.mjs`, `p2.mjs`, `p3.mjs`, mutation copy in `mut/`); nothing in the repo was edited. `node --test`: 46 pass.

Intent (from the pack and plan): a zero-dependency Node 22 collector that polls free Solana APIs, stores to SQLite, scores candidates behind vetoes (unknown caps at 79), and serves a 4-tab dashboard on 127.0.0.1. Research only.

## Act on

1. **A vetoed coin stays in "Running now" for up to 30 minutes.** `src/score.js:152-156` takes the latest `listed = 1` row per mint, so a newer `listed = 0` veto row is ignored. Breaks acceptance criterion 4 (pack "Acceptance criteria" 4). Proof: probe P1, a listed row at ts 1000 then a vetoed row at ts 1300, `runningNow(db, 1400s)` still returns `MINT`. Raised by: correctness. Fix: also require that no newer row for the mint has `listed = 0` (or join on the mint's latest row, then filter `listed = 1`).
2. **Consensus is missed when the last-processed buy is not the latest in time.** `src/ping.js:41,52-53` checks the window ending at the current buy's own `ts`, so buys by other wallets with a later block time are not counted. Wallets are polled one after another, so this order is normal. Proof: probe P2, three eligible wallets buy at ts 100/200/300: 1 alert if polled in time order, 0 alerts if polled A300, B200, C100. Raised by: correctness. Fix: count buys in `[ts - win, ts + win]`, or run the check once per cycle with the window ending at `max(ts)` of the mint's buys.
3. **One malformed request line kills the whole process.** `src/server.js:48` runs `new URL(req.url, ...)` outside the `try`; `GET //[ HTTP/1.1` throws `Invalid URL` as an uncaught exception, which stops the collector and every timer. Proof: probe P4, the `uncaughtException` handler fired and the socket got no reply. Raised by: security, correctness. Fix: move the `new URL` line inside the `try` and answer 400.
4. **A trace interrupted by a restart can never run again.** `src/tracer.js:71` returns `{status:'running'}` forever for a `running` row, whatever its age; the row is written at `:72` and only replaced when the run finishes. Proof: probe P3, a `running` row from 3 days earlier, `startTrace` still reports `running` and starts nothing. Raised by: correctness. Fix: treat `running` rows older than a few minutes (or any row found at startup) as stale.

## Consider

5. **DNS rebinding reads local data.** `src/server.js:42` never checks the `Host` header, so a page on another origin that rebinds its name to 127.0.0.1 can read `/api/narratives` (tracked wallet addresses and labels) and start traces. Proof: probe P5, a raw request with `Host: evil.example:4777` returns `HTTP/1.1 200 OK`. Bind-address criterion is met (mutation to `0.0.0.0` is caught). Raised by: security. Fix: reject any request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`.
6. **Late outcome fills are labelled with the wrong horizon.** `src/outcomes.js:27-28` stores the current price as the `due_ts` price even when the run was down for hours, so a "1 h" row can hold a 10 h price and pollute calibration. Proof: probe P6, a 1 h row due at 4600 filled at 4600 + 10 h returns `status: done`. Raised by: correctness. Fix: when `nowS > due_ts + 3600`, mark `missed` even if a price exists.
7. **A wallet with no history loses its first-ever trade.** `src/ping.js:16-19` sets no cursor when the first poll returns no signatures, so the next poll is again a "first cycle" and swallows the first buy. Proof: probe P3b (`p3.mjs`), cursor rows 0 after the empty cycle, first-ever buy recorded: 0. Raised by: correctness. Fix: store a sentinel cursor (e.g. empty string row with `until` omitted) and distinguish "no cursor" from "empty wallet".
8. **`buy_sell_ratio` with zero sells is a buy count, not a ratio.** `src/market.js:94` returns `sum(buys)` when `sells === 0`, so 500 buys and 0 sells records 500 beside a typical ~1.2 and pins the percentile at 100. Proof: probe P7 returns `500`. Raised by: correctness. Fix: return `null` (unknown) when sells is 0, or clamp to a fixed cap.
9. **Token descriptions are never stored, so themes use name and symbol only.** The plan (themes section) lowercases `name + symbol + description`; `grep description src` finds only the column in `src/db.js:8` and the keyword reader in `src/themes.js:6`. `profiles()`/`boosts()` return a description (`src/sources/dexscreener.js:47`) that `src/score.js:91` drops. Proof: grep, no write to `tokens.description`. Raised by: correctness. Fix: upsert `description` from the boosts/profiles results.
10. **Tests do not pin three spec-critical rules (mutation survivors).** In a copy of the repo, each change below left 46/46 tests passing: remove the fee-payer adjustment (`src/trades.js:23`), drop the empty-string case in `num` (`src/sources/geckoterminal.js:5`), turn off the zero-denominator guard in `div` (`src/score.js:11`). Also untested: the three bugs above (1, 2, 3). The helper `tx()` uses a 5000-lamport fee, far under the $0.5 threshold, so the fee never matters. Raised by: tests. Fix: add a buy sized so the fee flips the sign, `num('')` equals null, `scoreParts` with `buyers_h6 = 0` listing health as unknown, plus one test per finding 1-3.

## Noted

- Unproven: more than 20 new signatures between polls skips the older ones (`src/ping.js:21` takes the newest 20 and moves the cursor to the newest). No probe run.
- Unproven: claiming an airdrop that costs ATA rent above $0.5 (SOL above about $245) classifies as a buy (`src/trades.js:35`).
- `startTrace` `.then(...)` has no catch (`src/tracer.js:73-75`); a DB error there is an unhandled rejection. Not reachable by the current code.
- Any number of distinct valid addresses can queue traces of up to about 170 RPC calls each on one paced client (`src/tracer.js:26-62`); only meaningful together with finding 5.
- Tables grow without pruning (`pool_snapshots`, `market_samples`); `MAX(ts)` on `source = 'trending'` is unindexed. Fine for weeks, not months.
- `num(' ')` returns 0 (`src/sources/geckoterminal.js:5`); real APIs send `""` or null, not whitespace.
- `report.creatorBalance` null counts as 0.5 deployer credit instead of unknown (`src/score.js:29`); `ratio` treats a null sells count as 0 (`src/score.js:22`); `rollHourly` sums null volume as 0 (`src/market.js:87`).
- `rollHourly` reuses the latest trending snapshot with no age limit (`src/market.js:85`).
- Retry ignores a `Retry-After` header (`src/http.js:27`).
- Structure: column lists duplicated (`COLS` in `src/market.js:4`, `SNAP` in `src/score.js:72`), `median` written twice (`src/market.js:16`, `src/scorecard.js:3`), the `tokens` insert written twice (`src/market.js:24`, `src/score.js:128`), and a mutable exported `last` object carries the SOL price (`src/market.js:13`). All small; no abstraction recommended.

## Dismissed

- "Hostile names reach `innerHTML`": none found; `public/index.html` builds every node with `createElement`, `textContent` and `setAttribute`, and no `innerHTML` appears. Explorer hrefs come only from `B58`-validated addresses (`public/index.html:69`).
- "SQL injection": every value is a bound parameter; the only built SQL is `?` placeholders for the tracked-wallet list (`src/score.js:88`) and static column names.
- Bind address, 405 on non-GET, tracer address check: mutations to `0.0.0.0`, to allow non-GET and to skip the check each fail a test.
- 429 retry in both forms: the mutation that disables the in-body 429 check fails a test; HTTP 429 and 5xx share one branch (`src/http.js:16`).
- Veto vs score inside the pipeline and the 79 cap: `src/score.js:121,135,141` vetoes first, caps unknowns; the cap mutation fails a test. (Finding 1 is only the display query.)
- Sniper exclusion and the once-per-hour consensus rule, in time order: both mutations fail tests; the first-cycle cursor mutation fails 4 tests.
- Zero denominators in `scoreParts` and `trenchIndex`: `div` returns null for a zero or null divisor, and the percentile list always contains the newest value, so no NaN or division by zero in the code (only the tests are missing, finding 10).
- Transfer in without payment is not a buy, wrapped-SOL leg counts as payment, GeckoTerminal strings parse to null and not NaN: covered by tests and read as correct.

## Agreement map

No finding was raised from two angles by independent agents, because the review was run inline by one reader. The server crash (3) touched both correctness and security. Findings 1-3 are each also missing from the tests (finding 10).

## Not reviewed

- Acceptance criterion 11 (the reference site's name must not appear): the pack does not hold the name, so it was not searched.
- Live behaviour of GeckoTerminal `pools/multi`, RugCheck inner shapes, and the three manual criteria (listed in `risks.md`); no network was used.
- Visual and responsive quality of the dashboard.

## Blast radius

Method: check-impact. The repo was empty, so there are no callers; the question is what a running copy touches outside its own code. Proof run: `git archive HEAD` copied to the scratchpad `run/` folder, `wallets.txt` with 2 addresses and a label, `node src/main.js` with `fetch` replaced by a logging stub (`hook.mjs`), 13 s, then SIGINT. Greps cover `src/`, `public/`, `package.json`.

The one fact it is safe because of: the program has exactly one file write (SQLite via `src/db.js:24-25`), one listener (`src/server.js:67`), and one outbound call shape (`src/http.js:15`). Level 4 (ran it) for the listener, the files and the outbound URLs; level 2 (file:line) for the RPC path, which the stub run did not reach because the wallet cycle waits for a SOL price (`src/main.js:42`).

Confirmed risks
- **Confirmed, low: `wallets.txt` and the DB paths can be moved out of the ignore rules.** `src/config.js:8-9` take `CHEESEQUAKE_DB` and `CHEESEQUAKE_WALLETS` unchecked, and paths are relative to the current directory, not the repository. Run from another folder, it creates `data/` and `mkdirSync` (`src/db.js:24`) there. A wallet file named anything but `wallets.txt` is not ignored: `git check-ignore` reports `wallets.private.txt`, `my-wallets.txt`, `.env`, `data/backup.sqlite` as EXPOSED. `.gitignore` is only `data/*.db*`, `wallets.txt`, `.lavish/`, `node_modules/`. Fix if wanted: add `wallets*.txt` (keep `!wallets.example.txt`), `.env`, `data/*.sqlite*`.
- **Confirmed, already finding 5 above: any `Host` is answered.** Real run: `curl http://127.0.0.1:4791/api/narratives` returned 200; no Host check at `src/server.js:42`. Listener itself is fine (see cleared).
- `data/labels.json` is tracked (`labels` empty). If a person later adds addresses there they are committed; plan.md says none ship.

Cleared
- **Writes and deletes:** the only filesystem writes are `mkdirSync` and the SQLite file (`src/db.js:2,24-25`). No `writeFile`, `appendFile`, `unlink`, `rm`, `rename`, `child_process`, `eval` anywhere (grep of `src/ public/`). The only `DELETE` is of one `pending_sigs` row (`src/ping.js:30`). Run result: new file `data/cheesequake.db` only; `wallets.txt` SHA-1 identical before and after. `wallets.txt` is only read (`src/wallets.js:1,8`, `readFileSync`).
- **Listens on 127.0.0.1 only:** `server.listen(port, '127.0.0.1')` (`src/server.js:67`); `lsof` on the running process showed `TCP 127.0.0.1:4791 (LISTEN)` and no `*:` or `[::]` entry for it. Nothing else listens.
- **Wallet list never leaves:** in the run, 4 requests went out (GeckoTerminal new/trending pools, DexScreener boosts/profiles); the two wallet addresses and the label appear in none (`grep -c` = 0). Gecko, Dex and RugCheck URLs take pool and mint addresses only (`src/sources/*.js`). The wallet list reaches the RPC only as one address per `getSignaturesForAddress` call (`src/ping.js:17,21`, `src/tracer.js:38`), never as a list. The RPC host is `CHEESEQUAKE_RPC_URL` (default public Solana RPC), so a person who points it at a paid RPC gives that host their tracked addresses by design.
- **No key or secret sent:** no read of any key, token or secret exists; the only environment reads are the four settings in `src/config.js:2-9`. Request headers in the run were `{}` for GETs and `content-type` only for RPC POSTs (`src/sources/solana.js:6`). Error logs print the RPC method and message, not the URL (`src/main.js:38`, `src/sources/solana.js:9`), so an API key inside `CHEESEQUAKE_RPC_URL` is not logged.
- **Cannot sign or send a transaction:** the only RPC methods are `getSignaturesForAddress`, `getTransaction`, `getAccountInfo` (`src/sources/solana.js:14,15,17`). grep for `sendTransaction`, `signTransaction`, `simulateTransaction`, `sendRawTransaction`, `secretKey`, `privateKey`, `keypair`, `nacl`, `ed25519`, `mnemonic`: no hits in `src/`, `public/`, `package.json`. No dependencies, so no wallet library is present.
- **Ignored correctly:** `git check-ignore` confirms `wallets.txt`, `data/cheesequake.db`, `-wal`, `-shm` are ignored; `git ls-files` shows only `wallets.example.txt`, `src/wallets.js`, `test/wallets.test.js`, `data/labels.json` tracked.

Not proven: a live RPC request body (the stub run never reached the wallet cycle); this rests on the file:line reading above.
