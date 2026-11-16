# Cheesequake

A local research tool that watches Solana memecoins. It collects free market and on-chain data on timers, keeps it in one SQLite file and serves a dashboard on `127.0.0.1`. It never signs a transaction and never trades. **Not trading advice.**

## Start

Needs Node 22.13 or newer. No npm install: there are no dependencies.

```
cp wallets.example.txt wallets.txt   # add wallets to track
node src/main.js                     # or: npm start
```

Open the address it prints (default http://127.0.0.1:4777). Run the tests with `node --test`; they use no network.

Settings by environment variable: `CHEESEQUAKE_PORT`, `CHEESEQUAKE_DB` (default `data/cheesequake.db`), `CHEESEQUAKE_WALLETS` (default `wallets.txt`), `CHEESEQUAKE_RPC_URL` (default the public Solana RPC). Every threshold and interval lives in `src/config.js` and is a project default, untested until the system has collected history.

## Dashboard

| Tab | Shows |
|---|---|
| Market | Trench index 0-100 (Cold, Cool, Neutral, Hot, Euphoria) and a 30-day chart. Shows "warming up" for the first 7 days. |
| Ping | Buys and sells by tracked wallets, consensus alerts, exit alerts. |
| Narratives | Hourly keyword themes, "Running now" candidates with score and reasons, wallet scorecard, calibration table. |
| Tracer | Fund flow from a start wallet, hop by hop. |

Candidates pass a list of vetoes first. Survivors get a 0-100 score. A missing answer from any source is "unknown", never a pass, and caps the score at 79. Each listed candidate's later price is logged at 1, 6 and 24 hours so the score can be checked against outcomes.

## wallets.txt

One wallet per line: `<address>[,<label>]`. `#` starts a comment. Bad lines are skipped with a warning. The file is re-read every cycle. About 40 wallets is the most the public RPC will serve.

## data/labels.json

`{"labels": [{"address": "...", "name": "...", "type": "exchange"}]}` where `type` is `exchange`, `mixer` or `other`. It ships empty. Tracer stops at labelled addresses, so add ones you have verified yourself.

## Limits

- Free endpoints (GeckoTerminal, DexScreener, RugCheck, a public RPC) rate-limit and can change without notice. Affected fields show as "unknown".
- Holder, insider and lock data come from one source.
- Social media data is not an input.
- Keyword themes are crude. Scores are unvalidated until the outcome log has weeks of data.
- Tracked wallets backfill only their recent transactions on first sight (up to 20 non-error transactions from the latest 100 signatures) without raising alerts; older history is not fetched.
