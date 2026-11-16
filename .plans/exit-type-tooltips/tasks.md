## Build
- [x] Add `KIND_INFO` (for `buy`, `sell`, `consensus`, `exit_deployer`, `exit_wallet`, `exit_liquidity`, `exit_divergence`), `.info-tip`/`.tip-box` CSS, and `kindCell(kind)` with an accessible `ⓘ` button and tooltip in `public/index.html`, wire it into Watch (`renderWatchedEntry`) and Ping (`ping`) alert tables, and add unit tests in `test/ui.test.js`.

## Verification
- [x] `npm test` passes with all existing and new tests.

## Manual checks
- [ ] `manual:` Open the dashboard in a browser (light/dark, desktop/narrow), hover and keyboard-focus `ⓘ` on rows in both Watch and Ping tabs, and confirm the tooltip is readable and not clipped.
