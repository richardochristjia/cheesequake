# Narratives tab a beginner can read

## Problem

On the Narratives tab in `public/index.html`, "Running now" is buried three screens down below up to 38 keyword theme rows (including filler words), its "Why" drawer prints one `|`-joined grey shorthand string (`wallets 0/30: wallet weight 0 | ...`) that never explains what a part means or whether its number is good, jargon labels (`risk`, `Unknown`) and an unscaled score assume prior knowledge, and on phones the wide HTML table overflows the viewport with 28px-tall buttons.

## Solution

- Rewrite only the Narratives tab rendering and supporting CSS in `public/index.html` (Direction A: plain list on the existing `:root` tokens and `system-ui` font; API, scoring, and `src/themes.js` stay untouched).
- Add a client-side glossary covering every `config.weights` part (`wallets`, `health`, `deployer`, `liquidity`, `momentum`, `narrative`) with plain names and honest level sentences (`Good`, `OK`, `Weak`, `None`, `No data`) keyed off `points / max` (and `unknowns` for `No data`), every `config.bands` label (`strong` → `Strong`, `confirm` → `Promising`, `neutral` → `Mixed`, `risk` → `Weak`, `avoid` → `Very weak`), and every missing-data key (`mint_authority`, `freeze_authority`, `rugged`, `transfer_fee`, `lp_unlocked`, `top10`, `insiders`, `liquidity`, `age`, `wash`, `wallets`, `health`, `deployer`, `momentum`, `narrative`).
- Reorder cards to: Running now, Themes this hour (top 5 rows + "Show all" toggle), Best calls: wallet scorecard (`"unknown"` → `"not enough trades yet"`), Calibration (`"No results yet. The tool checks each coin's price 1, 6 and 24 hours later."`), with a one-sentence `.lead` under each heading.
- Rebuild Running now as CSS grid rows (`Coin`, `Theme`, `Score`, `Reading`, `Market cap`, `Missing data`, action) with a quiet `"Explain score"` button (`"Hide"` when open), preserving open row mints across 30 s refreshes, and rendering the six-row explanation list plus the missing-data cap footnote (`Missing data counts as 0 points and caps the score at 79.`).
- Add `@media (max-width:700px)` stacked two-column coin cards with `data-l` labels and full-width 44px buttons, a high-contrast `:focus-visible` ring (≥3:1 against dark/light card backgrounds), body text contrast ≥7:1 on explanation sentences, and a `"Loading…"` placeholder before first fetch.

## Files

- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/public/index.html` — Glossary, Narratives card order, Themes top-5 toggle, Running now grid + Explain score breakdown, phone layout, focus-visible ring, loading state (all API values via `textContent`).
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/server.test.js` — Tests verifying glossary coverage of `config.weights` and `config.bands`, `"No data"` vs `"None"` handling, missing symbol/theme fallbacks, and open-row preservation across refresh.
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/.agents/RECORD.md` — Add `(dashboard)` entry in Verification if implementation matches the plan.

## Acceptance criteria

1. `design.md` `Gate (app)` passes at `1440,1024,820,768,390` (`consistency.mjs` with `--no-rhythm --no-tiles --no-visuals --no-address --json --out .plans/narratives-beginner/taste/after`, ignoring `cta`, `copy-headline`, `effects-fit`, `copy-fact`, `copy-actions`), and `shoot.mjs` rubric score is ≥ 4/10.
2. Raw `consistency.mjs` FAIL count in `.plans/narratives-beginner/taste/after` is ≤ 24 (`before` count).
3. "Running now" renders as the first card on the Narratives tab; "Themes this hour" caps at 5 rows until "Show all" is clicked.
4. Clicking "Explain score" opens six part rows, each showing a level tag (`Good`/`OK`/`Weak`/`None`/`No data`), one plain sentence, and `x of y` points; no `|`-joined shorthand string remains.
5. At `390` width no coin row content is cut off horizontally and action buttons in Running now are at least 44px tall.
6. Market, Ping, and Tracer tabs behave as before and `npm test` passes.
7. `public/index.html` still builds no markup from strings (`test/server.test.js` `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` check passes).

## Risks

- Part names or band keys could drift between `src/config.js` / `src/vetoes.js` and the inline glossary in `public/index.html`; a new unit test asserts parity against `config.weights` and `config.bands`.
- Recomputing Narratives DOM every 30 s could reset open drawers or theme expansion; keeping module-level `openMints` (Set) and `showAllThemes` (boolean) preserves state across refreshes.
- Inline CSS tweaks for contrast (`:focus-visible` and body text) could clash with dark/light system tokens; checked explicitly with `consistency.mjs` in headless Chrome.

## Test plan

- `test/server.test.js` covers API serving, `innerHTML` safety, glossary parity with `config.weights` and `config.bands`, `"No data"` vs `"None"` level selection, missing symbol/theme fallback (`short(mint)` / `"no theme"`), and open-row state across `narratives()` refreshes; run `npm test`.
- App gate & screenshots run via `node <taste>/scripts/consistency.mjs` and `node <taste>/scripts/shoot.mjs` against a seeded local server with `.plans/narratives-beginner/taste/after`.
