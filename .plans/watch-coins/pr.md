# Watch Coins (`watch-coins` -> `main`)

## Summary

- Add `watched_coins(mint PRIMARY KEY, added_ts)` to SQLite and expose `GET`, `POST`, and `DELETE` on `/api/watch` with base58 mint validation and an `onWatch` trigger for immediate background candidate/exit scanning.
- Prioritize watched mints first in `runCandidates` and evaluate all safety vetoes on watched coins even when a cheap veto trips, persisting the full veto set so hold reasons stay complete.
- Include watched coins and their creators in `deployerWallets` and `checkExits` regardless of `listed` status or age so deployer sells, tracked-wallet exits, sharp liquidity drops, and divergence alerts fire on watched coins.
- Add `watchList(db, now, config)` to classify watched coins into `Safe to hold` (`safe`), `Caution` (`caution`), or `Red flag` (`flag`) with plain-English reasons, latest pool metrics, and per-coin ping alerts (querying 24h `exit_*` alerts directly from SQLite).
- Add the dashboard `Watch` tab with quick `Watch`/`Watching` toggles on `Running now` and `Ping` (hydrated on load), status badges, per-coin alert tables, and a lazy-mounted DexScreener candle chart `<iframe>` that preserves open state across refreshes.

## How it was tried

- Tier M skipped the automated browser walkthrough (`tier.md`); verified the full unit and integration suite (`node --test`, 37/37 passing) including VM-rendered `Watch` tab interactions, `Watching` state hydration across tabs, and lazy chart `<iframe>` toggle persistence.
- Try it yourself:
  ```sh
  node --test
  npm start
  # Open http://127.0.0.1:4200, open the Watch tab, watch a Solana mint, and click "Show chart"
  ```

## Needs your call

1. **Manual check (`plan.md` AC #8):** Start the server with `npm start`, watch a live Solana mint in the `Watch` tab, and click `Show chart` to verify the live DexScreener candle `<iframe>` loads in a real browser.
2. **Open finding (`falsify.md`):** `onWatch` in `src/main.js` runs `runCandidates` without sharing the periodic timer's `busy` lock; overlapping scans only append an extra candidate snapshot without affecting `watchList` or `runningNow`.
3. **Open finding (`falsify.md`):** `watchInput` in `public/index.html` does not bind `oninput`, so an unsubmitted mint draft in the input box resets if the 30-second background refresh fires while typing.
