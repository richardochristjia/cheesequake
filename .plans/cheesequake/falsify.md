# Falsify: cheesequake

Reproduced by re-running the scratchpad probes `p1.mjs`, `p2.mjs`, `p3.mjs` and a new `f4.mjs` (raw socket against `createServer`). All four "Act on" findings and the Host finding reproduce. The `.gitignore` finding was checked with `git check-ignore`.

## Rulings (worst harm first)

- fix: server dies on one malformed request line (security, correctness). `GET //[ HTTP/1.1` over a raw socket printed `UNCAUGHT Invalid URL` and the socket got no reply (f4). Only a local process can send it (browsers normalise URLs), but the result is the collector and every timer stopping. Cheapest: move `new URL(...)` at `src/server.js:48` inside the existing `try` and let the catch answer. Today the catch answers 500, so return 400 for that error or accept 500. Test: raw request with `//[` gets a reply and the process lives.
- fix: vetoed coin stays in "Running now" (correctness). P1: listed row, then a newer vetoed row, `runningNow` still returns `MINT`. Every dashboard user sees a coin the veto rules should hide, and it breaks acceptance criterion 4 (a wrong state, not a recoverable message). Cheapest: take `MAX(id)` per mint over all rows in the window, then filter `listed = 1` on that row (a query change, no new rule). Test: listed row then vetoed row gives an empty list.
- fix: consensus misses when polling order is not time order (correctness). P2: buys at 100/200/300 give 1 alert in time order and 0 alerts when polled 300, 200, 100. Wallets are polled one at a time, so this is the normal case, and the headline alert silently fails (missed action). Cheapest: change `BETWEEN ts-win AND ts` to `ts-win AND ts+win` in `src/ping.js:41`. The existing `exists` check still stops a second alert. Test: the reversed-order case gives exactly 1 alert (P2 is the test).
- fix: a `running` trace row never expires (correctness). P3: a 3-day-old `running` row, `startTrace` returns `running` and starts nothing. Hit by anyone who stops the program while a trace runs; that wallet can never be traced again without hand-editing the DB (wrong state, not recoverable in the UI). Cheapest: in `src/tracer.js:71` replace `row.status === 'running'` with `running.has(start)`, using the in-memory map that already exists. No new rule or timer. Test: a `running` row with an empty map starts a new run.
- fix: any `Host` header is answered, so DNS rebinding can read the tracked wallet list and start traces (security, blast radius). Reproduced: `Host: evil.example:4777` returns 200 (P5). The path is plausible: the user has the dashboard running and opens a hostile page, which rebinds its name to 127.0.0.1 and reads `/api/narratives`. The harm is private wallet addresses and labels, plus up to ~170 RPC calls per trace. Cheapest: one line at the top of the handler, 403 unless `req.headers.host` matches `/^(127\.0\.0\.1|localhost)(:\d+)?$/`. The regex takes any port, so no new setting. Test: `Host: evil.example` gets 403 and `Host: 127.0.0.1:4777` gets 200.
- narrow: `.gitignore` covers only `wallets.txt` and `data/*.db*` (blast radius). `git check-ignore` reports none of `wallets.private.txt`, `.env`, `data/backup.sqlite` as ignored. Only someone who sets `CHEESEQUAKE_WALLETS` to another name, or keeps a copy beside it, can leak the list by committing it; the default path is ignored. Cheapest: add `wallets*.txt` and `!wallets.example.txt` to `.gitignore`. Skip `.env` (the program reads no env file) and `data/*.sqlite*` (the default DB name is `.db`).

## For the fixer
The five fixes and the one narrow above, each with its named test (this also covers the part of Consider 10 that asks for tests for findings 1-3, and adds one each for 4 and the Host check).

## For the user
Nothing needs the user's call: no fix adds a flag, setting or special-case branch.

## Consider findings (one line each)
- 5 (DNS rebinding): fix now, see above.
- 6 (late outcome fill, wrong horizon): leave open; only after hours of downtime, and the fix is a new `missed` rule.
- 7 (empty wallet loses its first trade): leave open; one missed buy for a wallet with no history, and the fix needs a cursor sentinel.
- 8 (`buy_sell_ratio` with zero sells): leave open; an hourly sum across many pools is practically never zero sells, and nothing shows it happening.
- 9 (token descriptions not stored): fix now; the plan says themes use the description, and it is a one-line upsert.
- 10 (mutation survivors): fix now only the tests for the four bugs plus Host; leave open the fee-payer, `num('')` and `div` guard tests (nothing shows they are wrong today).
