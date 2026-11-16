# Review: wallet-activity-view

Single-angle review (**Correctness** only, Tier M) per `interrogate` one-angle mode, grounded in `.plans/wallet-activity-view/context-pack.md`.

### Intent
> Enrich `/api/ping` and `/api/watch` alerts with registered wallet user labels (`wallet_label` on direct alerts and `detail.wallet_labels` on `consensus` alerts), support `?wallet=<address>` filtering on `/api/ping` across both direct and `consensus` alerts (composable with `?kind=` and validated against `B58`), and update the **Ping** and **Watch** UI tabs to display registered wallet labels alongside address links and filter **Ping** activity by wallet.

### Reviewers
- Reviewer A: Correctness, 0 blocking findings (2 low-impact observations sorted into Noted / Dismissed)

### Act On
None.

### Consider
None.

### Noted
- **Removed-wallet edge case on live refresh (`public/index.html:88-92`)**: In `ping()`, `wsel.value = pingWallet` restores the selected wallet across refreshes using the options built from `d.wallets` (`src/server.js:38`). If a user selects a wallet in the UI and simultaneously edits `wallets.txt` to remove that address while keeping the tab open, a browser `<select>` without a matching `<option>` will display unselected while module state `pingWallet` (`public/index.html:75`) retains the address until the user changes the dropdown. Impact is negligible in normal operation.

### Dismissed
- **Unbounded SQL scan on `consensus` rows when `?wallet=` is set (`src/server.js:27-37`)**: When `wallet` is specified, the query omits `LIMIT 200` in SQL and applies `.slice(0, 200)` after filtering `a.detail.wallets.includes(wallet)` in JS (`src/server.js:36-37`). Dismissed because `consensus` rows store `wallet = NULL` in SQLite (`context-pack.md` "Do not re-derive"), so applying `LIMIT 200` before inspecting `detail.wallets` would drop matching rows whenever >200 newer consensus alerts for other wallets exist (proven by the regression test in `test/server.test.js:393-423`).

### Verification Proof
Ran full suite (`npm test` -> 69/69 passing, 0 failures), including:
- `test/server.test.js:380-442` (`/api/ping` and `/api/watch` label enrichment, `?wallet=` + `?kind=` composition, >200 consensus history preservation, and HTTP 400 on invalid base58).
- `test/server.test.js:444-505` (Ping and Watch DOM rendering of registered wallet labels, consensus wallet labels, and persistent wallet `<select>` filtering).

### Agreement Map
Single-angle review (Correctness only, Tier M). All 6 acceptance criteria in `.plans/wallet-activity-view/context-pack.md` are met with no `Act on` or `Consider` findings.
