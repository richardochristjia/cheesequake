# Falsify — `watch-coins`

## Rulings (worst harm first)

```
fix: watchList checks 24h exit alerts on the LIMIT 50 UI slice instead of querying exit alerts directly, flipping a coin from Red flag to Safe to hold after 50 buy/sell alerts (Reviewer A). Reproduced with node -e against watchList(db, now): 1 exit_deployer alert + 50 buy alerts in 24h returns status "safe" instead of "flag".
fix: watchedSet is never hydrated until the Watch tab is visited, so Narratives and Ping render already-watched coins as "Watch" and send POST instead of DELETE on click (Reviewer A). Reproduced with node -e against the public/index.html VM harness: narratives() renders "Watch" instead of "Watching" for a seeded watched coin.
leave open: onWatch triggers an unserialized runCandidates scan on POST /api/watch (Reviewer A). Unproven (no reproduction run); defensive check; nothing shows it's needed because single-user localhost clicks are rare and runningNow/watchList read the latest candidate row by id.
leave open: watchInput in public/index.html is never updated on input across the 30s poll (Reviewer A). Unproven minor UI polish; pasting a mint address and clicking Watch coin takes under a second.
dismiss: Redundant evaluation of CHEAP rules for watched mints in runCandidates (Reviewer A). Already deduplicated via Set over pure synchronous in-memory checks with zero behavioral or performance impact.
```

## For the fixer

1. **fix (`src/score.js:194-206`, `test/score.test.js`):** In `watchList`, query active 24h exit alert kinds directly from SQLite (e.g. `SELECT DISTINCT kind FROM alerts WHERE mint = ? AND ts > ? AND kind LIKE 'exit_%'`) for `hasAlert`, keeping `LIMIT 50` only for the returned `alerts` feed.
   - **What it buys:** Prevents 50 tracked-wallet `buy`/`sell` alerts in a 24h window from pushing an `exit_deployer`, `exit_liquidity`, `exit_wallet`, or `exit_divergence` alert out of the `LIMIT 50` slice and falsely downgrading a coin's hold status to `safe`.
   - **Proving test:** In `test/score.test.js` (`watchList classifies safe, caution, and flag coins with reasons and alerts`), insert 50 `buy` alerts newer than the `exit_deployer` alert on `mintFlag` within the 24h window and assert `byMint.get(mintFlag).status === 'flag'`.
2. **fix (`public/index.html:132-152,240,439,506-523`, `test/server.test.js`):** Hydrate `watchedSet` from `/api/watch` before or during initial tab renders so `watchBtn` reflects persisted watched coins on `Narratives` and `Ping` even before the user opens the `Watch` tab.
   - **What it buys:** Accurate `Watching` (`aria-pressed="true"`) button state and `DELETE /api/watch` unwatch behavior on `Narratives` and `Ping` from initial page load.
   - **Proving test:** In `test/server.test.js`, load the dashboard with a seeded watched coin, run `narratives()` without calling `watch()` first, and assert the coin's watch toggle button text is `'Watching'` with `aria-pressed="true"`.

## For the user

- None.

## For the PR's open findings

- `onWatch` in `src/main.js` runs `runCandidates` without sharing the periodic timer's `busy` lock; overlapping scans only append an extra candidate snapshot without affecting `watchList` or `runningNow`.
- `watchInput` in `public/index.html` does not bind `oninput`, so an unsubmitted mint draft in the input box resets if the 30-second background refresh fires while typing.

## Dismissed

- **Redundant evaluation of `CHEAP` rules for watched mints (`src/score.js:127,140`):** `evaluate` is pure and synchronous over in-memory objects and `vetoes` is deduplicated via `new Set`, so re-running `CHEAP` rules on watched mints has no behavioral or performance effect.
