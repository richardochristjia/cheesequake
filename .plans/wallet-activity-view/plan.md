# Wallet Activity Filter and Registered Wallet Labels

## Problem

The dashboard's **Ping** ("Wallet activity") tab and **Watch** per-coin alert tables only render raw shortened Solana addresses (`CyaE…a54o`), ignoring the registered wallet user names configured in `wallets.txt` (`<address>,<label>`), and `consensus` alerts only show a count (`3 wallets`) without naming which tracked wallets bought. Additionally, the **Ping** tab only filters by alert kind (`all`, `buy`, `sell`, `consensus`, `exit`) and provides no way to view wallet activity for a specific tracked wallet.

## Solution

- Build a wallet label lookup map (`address -> label`) from `wallets()` in the server and pass it to both `/api/ping` and `watchList`.
- Extend `/api/ping` in `src/server.js` to:
  - Return `wallets: wallets()` alongside `alerts`.
  - Enrich each alert with `wallet_label` (the registered label for `a.wallet`, or `null`) and, for `consensus` alerts, `detail.wallet_labels` (an object mapping each address in `detail.wallets` to its registered label when present).
  - Accept an optional `wallet` query parameter (`?wallet=<address>`). Validate it against `B58` (returning `[400, { error: 'invalid wallet address' }]` if non-empty and invalid). When provided, filter alerts to rows where `a.wallet === wallet` or `(a.kind === 'consensus' && Array.isArray(a.detail.wallets) && a.detail.wallets.includes(wallet))` before applying the 200-row cap (or filter in SQL / post-parse so up to 200 matching alerts are returned).
- Extend `watchList(db, now, config, wallets = [])` in `src/score.js` (and pass `wallets()` from `src/server.js` in both `GET /api/watch` and `POST/DELETE /api/watch`) so each coin's `alerts` also carry `wallet_label` and `detail.wallet_labels`.
- Update `public/index.html`:
  - Add a `walletCell(address, label)` helper that renders `[label + ' ', link(address)]` when `label` is truthy, or `link(address)` when unlabeled, and `consensusWallets(a)` to render the participating wallets with their registered names and links.
  - Add a wallet filter `<select aria-label="Wallet">` in the **Ping** tab next to the `Alert kind` `<select>`, with an `all wallets` default option (`value=""`) and options for each wallet in `d.wallets` (`label ? label + ' (' + short(address) + ')' : short(address)`), persisting `pingWallet` across refreshes and passing `wallet` in the `/api/ping` query string.
  - Render `walletCell` in both the **Ping** table and the **Watch** per-coin alert tables, and include participating wallet names in `consensus` alerts.

## Files

- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/server.js` — Pass `wallets()` to `watchList`, add `?wallet=` validation and filtering to `/api/ping`, return `wallets` in `/api/ping`, and attach `wallet_label` / `detail.wallet_labels` to `/api/ping` alerts.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/score.js` — Accept `wallets = []` in `watchList` and attach `wallet_label` / `detail.wallet_labels` to each coin's `alerts`.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/public/index.html` — Add wallet `<select>` filter to Ping tab, and render registered wallet labels in Ping alerts, Watch alerts, and `consensus` details.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/server.test.js` — Add API and dashboard VM tests for wallet filtering, invalid wallet `400` response, and registered wallet label display in Ping and Watch.

## Acceptance criteria

1. `/api/ping` includes `wallets` (`[{ address, label }]`) and enriches each returned alert with `wallet_label` (string or `null`) and `detail.wallet_labels` (`{ [address]: label }` for `consensus` alerts) (checked by `test/server.test.js`).
2. `/api/ping?wallet=<address>` returns only alerts where `wallet === <address>` or `kind === 'consensus'` with `<address>` in `detail.wallets`, combinable with `?kind=`, and returns HTTP `400` `{ error: 'invalid wallet address' }` when `wallet` is not valid base58 (checked by `test/server.test.js`).
3. `/api/watch` enriches each watched coin's `alerts` with `wallet_label` and `detail.wallet_labels` from the registered wallet list (checked by `test/server.test.js`).
4. The **Ping** tab renders a wallet `<select>` filter next to the kind `<select>`, preserves the selected wallet across refreshes, requests `/api/ping` with `wallet=<address>`, and displays registered wallet user names alongside address links in the Wallet column and on `consensus` alerts (checked by `test/server.test.js`).
5. The **Watch** tab's per-coin alert tables display registered wallet user names alongside address links and on `consensus` alerts (checked by `test/server.test.js`).
6. All unit and integration tests pass via `npm test`, and `public/index.html` uses only safe DOM construction with no `innerHTML` or string markup assignment (checked by `npm test`).

## Risks

- **SQL `LIMIT 200` before wallet filter could hide older matching consensus alerts:** Filtering `a.wallet = ? OR a.kind = 'consensus'` in SQL (and checking `detail.wallets.includes(wallet)` in JS before slicing to 200) ensures active coins do not crowd out a wallet's own history.
- **Untracked or removed wallets in historical alerts:** If an alert references a wallet not currently in `wallets.txt` (or a deployer address on `exit_deployer`), `wallet_label` is `null` and the UI falls back cleanly to `link(address)`.

## Test plan

- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/server.test.js`:
  - Verify `/api/ping` returns `wallets`, `wallet_label`, and `detail.wallet_labels`.
  - Verify `/api/ping?wallet=<addr>` filters both direct and `consensus` alerts, composes with `?kind=`, and rejects invalid wallet addresses with HTTP `400`.
  - Verify `/api/watch` includes `wallet_label` and `detail.wallet_labels` on coin alerts.
  - Verify the Ping tab and Watch tab in the dashboard VM render wallet labels, consensus wallet names, and filter by wallet selection.
- Run with: `npm test`
