# Tasks

## Phase 1: Glossary
- [x] Add a glossary in `public/index.html` covering every `config.weights` part (`wallets`, `health`, `deployer`, `liquidity`, `momentum`, `narrative`) with plain names and honest sentences per level (`Good`, `OK`, `Weak`, `None`, `No data`), every `config.bands` reading label (`strong`, `confirm`, `neutral`, `risk`, `avoid`), and plain missing-data names for all veto/score unknown keys.

## Phase 2: Running now and Explain score
- [x] Rebuild "Running now" in `public/index.html` as CSS grid rows with columns `Coin`, `Theme`, `Score`, `Reading`, `Market cap`, `Missing data`, and quiet `"Explain score"` / `"Hide"` action button.
- [x] Render the six-row "Explain score" breakdown panel (level tag, plain name, sentence chosen from `points / max` or `unknowns` for `No data`, and `x of y` points) plus the missing-data cap footnote, preserving open rows across the 30-second refresh.

## Phase 3: Card order, themes cap, and lead sentences
- [x] Reorder Narratives cards to Running now, Themes this hour, Best calls: wallet scorecard, Calibration.
- [x] Cap "Themes this hour" at 5 rows with a `"Show all <N> themes"` / `"Show top 5"` toggle preserved across refreshes.
- [x] Add one-sentence `.lead` descriptions under each card heading and update Wallet scorecard `"unknown"` to `"not enough trades yet"` and Calibration empty copy per `design.md`.

## Phase 4: Responsive layout, focus ring, and loading state
- [x] Add `@media (max-width:700px)` stacked two-column coin layout with `data-l` labels and full-width ≥44px buttons, ensure ≥7:1 sentence contrast and ≥3:1 `:focus-visible` ring, and add `"Loading…"` state before initial fetch.

## Phase 5: Tests
- [x] Add unit tests in `test/server.test.js` covering `config.weights` and `config.bands` glossary coverage, `"No data"` vs `"None"` for 0-point parts, missing symbol/theme fallbacks, and open-row preservation across 30 s refresh.

## Verification
- [x] Gate (app) passes at `1440,1024,820,768,390` (`consistency.mjs` app filter, ignoring `cta`, `copy-headline`, `effects-fit`, `copy-fact`, `copy-actions`), and `shoot.mjs` rubric score is ≥ 4/10.
- [x] After raw `consistency.mjs` FAIL count in `.plans/narratives-beginner/taste/after` is ≤ 24.
- [x] "Running now" is the first card; themes show 5 rows until "Show all" is pressed.
- [x] Opening a row shows six parts, each with a level, a sentence, and points; no `|`-joined line remains.
- [x] At `390` wide nothing is cut off and the button is at least 44px tall.
- [x] Market, Ping, and Tracer tabs look and work as before; `npm test` passes.
- [x] `public/index.html` still builds no markup from strings (`test/server.test.js` safety check passes).
- [x] Record Updates: review the complete implementation; if it matches the planned Record entry (`- (dashboard) The Narratives tab explains each score part in plain words chosen from the part's share of its maximum points.`), append it to `.agents/RECORD.md`; if it diverged, do not write a wrong entry and surface the divergence in the final summary.
