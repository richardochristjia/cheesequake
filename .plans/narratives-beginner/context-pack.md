# Context pack

BASE: cheesequake (HEAD `d8827cb`, branched from `cheesequake`; `main` has only the empty initial commit)
CHANGED: 2 files, +378/-23

## What this change does
Rewrites the Narratives tab in `public/index.html` into plain beginner language: puts Running now first as a CSS grid with an expandable 6-part score breakdown, caps Themes this hour at 5 rows with a toggle, maps jargon bands/null wallet stats/unknown keys to plain labels, adds mobile two-column cards and loading state, and adds DOM-sandboxed unit tests in `test/server.test.js`. API, scoring, and `src/` are untouched.

## Files
- `public/index.html` — CSS tokens/grid/mobile layout (`public/index.html:8-71`), glossary (`PARTS`, `BANDS`, `UNKNOWNS`, `explainPart`, `public/index.html:139-249`), `renderRunning` (`public/index.html:251-293`), `renderThemes` (`public/index.html:295-317`), `narratives()` (`public/index.html:319-346`), loading placeholder (`public/index.html:392`).
- `test/server.test.js` — `loadDashboard()` `vm` DOM harness (`test/server.test.js:93-142`), glossary parity/level test (`test/server.test.js:144-162`), and narratives card-order/fallback/refresh-state test (`test/server.test.js:164-231`).

## API & DOM contracts
- `GET /api/narratives` → `{ themes, running, wallets, calibration }` declared in `src/server.js:25-33`:
  - `running[]` (`src/score.js:152-160`): `{ mint, symbol, name, theme, score, band, mcap_usd, reasons: [{ part, points, max, note }], unknowns: string[] }`.
  - `themes[]` (`src/server.js:28`): `{ keyword, tokens, volume, share }`.
  - `wallets[]` (`src/scorecard.js:30-37`): `{ address, label, class, bought, winRate, medianHoldSeconds, stillHoldingShare }`.
  - `calibration` (`src/outcomes.js:34-45`): `{ rows: [{ band, horizon_h, count, meanChangePct, positiveShare }], missed }`.
- Config & unknown-key sources: `config.weights` (`src/config.js:21`), `config.bands` (`src/config.js:22`), `config.unknownCap` (`79`, `src/config.js:23`), veto/unknown keys (`src/vetoes.js:15-53`).
- DOM contracts (`public/index.html`):
  - No HTML string assignment; all values pass through `h()` / `textContent` (`public/index.html:75-84`).
  - `#narratives` renders four `.card` `<h2>` headings in order: `Running now`, `Themes this hour`, `Best calls: wallet scorecard`, `Calibration: later price by score band` (`public/index.html:322-345`).
  - Running now rows use `.grid` with `data-l` labels (`public/index.html:262-269`), `.go` button (`aria-expanded`, `Explain score` / `Hide`), and `.why` drawer containing 6 `<li class="part">` rows (`public/index.html:271-289`) + cap footnote (`public/index.html:280`).
  - Themes uses `.trow`, capped at 5 until `.more` toggles `showAllThemes` (`public/index.html:295-317`).
  - `@media (max-width:700px)` hides `.grid.head`, uses 2-column `.grid` with `[data-l]::before` labels, and makes `.grid .go, .more` full-width at `min-height:44px` (`public/index.html:64-71`).

## Design gate & states (`.plans/narratives-beginner/design.md:1-24`)
- Direction A (plain list on existing `:root` tokens, `system-ui`, 8px radius, no hero/visuals/fold-action); widths `1440, 1024, 820, 768, 390`.
- States: Running now empty/zero `"Nothing has passed every safety check in the last 30 minutes."`, loading `"Loading…"`, error `"Could not load: …"`, success `.grid` rows; Explain score zero `"None"`, success 6 rows; Themes empty `"No themes yet."`, success top 5 + toggle; Wallet scorecard empty `"No wallets tracked. Add some to wallets.txt."`, null metrics `"not enough trades yet"`; Calibration empty `"No results yet. The tool checks each coin's price 1, 6 and 24 hours later."`.
- Baseline `.plans/narratives-beginner/taste/before`: `FAIL 24 WARN 123`, rubric `4/10`. Gate (app): `consistency.mjs` app filter (`modes/app.md`) no `FAIL`, rubric after ≥ before.

## Test entry points
- Full suite: `npm test` (`node --test`, 55/55 passing on `d8827cb`).
- Narratives glossary & DOM suite: `node --test test/server.test.js` (`test/server.test.js:144-231`).

## Acceptance criteria (`.plans/narratives-beginner/plan.md:23-29`)
1. manual (browser gate): `design.md` `Gate (app)` passes at `1440,1024,820,768,390` (`consistency.mjs` with `--no-rhythm --no-tiles --no-visuals --no-address --json --out .plans/narratives-beginner/taste/after`, ignoring `cta`, `copy-headline`, `effects-fit`, `copy-fact`, `copy-actions`), and `shoot.mjs` rubric score is ≥ 4/10.
2. manual (browser gate): Raw `consistency.mjs` FAIL count in `.plans/narratives-beginner/taste/after` is ≤ 24 (`before` count).
3. "Running now" renders as the first card on the Narratives tab; "Themes this hour" caps at 5 rows until "Show all" is clicked.
4. Clicking "Explain score" opens six part rows, each showing a level tag (`Good`/`OK`/`Weak`/`None`/`No data`), one plain sentence, and `x of y` points; no `|`-joined shorthand string remains.
5. At `390` width no coin row content is cut off horizontally and action buttons in Running now are at least 44px tall.
6. Market, Ping, and Tracer tabs behave as before and `npm test` passes.
7. `public/index.html` still builds no markup from strings (`test/server.test.js` `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` check passes).

## Do not re-derive
- `explainPart` (`public/index.html:234-249`): missing `reason` OR `key` in `unknowns` selects `'No data'` *before* `pts <= 0` (`'None'`); otherwise `pts / max` maps `>= 0.75` → `'Good'`, `>= 0.4` → `'OK'`, `< 0.4` → `'Weak'`.
- `openMints` (`Set`, `public/index.html:251`) and `showAllThemes` (`boolean`, `public/index.html:295`) live at module scope so 30s `setInterval(refresh, 30000)` (`public/index.html:403`) keeps open drawers and theme expansion across refreshes.
- `PARTS.narrative.levels.{Good,OK,Weak}` are functions `(theme) => string`, while `None` and `'No data'` are plain strings (`public/index.html:196-205`).
- Previous behavior replaced: Themes was first, Running now was second as a wide `<table>` with `Why` toggling a `|`-joined `reasons` line, raw band keys (`risk`), `unknown` on null wallet metrics, and no loading text on initial tab switch (`.plans/narratives-beginner/diff-ui.patch:254-273`).
- Outside this commit: `.plans/narratives-beginner/taste/after` (browser gate) has not been generated yet, and `.agents/RECORD.md` has not been updated yet.

## Diff
Full diff (`463` lines, `3,566` words) exceeds the 3,000-token pack budget, so it is split verbatim by file group:
- **UI (`public/index.html`, +237/-23, 307 diff lines)**: `.plans/narratives-beginner/diff-ui.patch` (`git diff cheesequake...HEAD -- public/index.html`) — CSS tokens/grid/focus/mobile (`public/index.html:8-71`), glossary + `renderRunning` + `renderThemes` (`public/index.html:139-317`), `narratives()` rewrite (`public/index.html:321-345`), loading state (`public/index.html:392`).
- **Tests (`test/server.test.js`, +141/-0, 156 diff lines)**: `.plans/narratives-beginner/diff-tests.patch` (`git diff cheesequake...HEAD -- test/server.test.js`) — `vm` import + `loadDashboard` harness (`test/server.test.js:5,93-142`), glossary parity test (`test/server.test.js:144-162`), narratives DOM/state test (`test/server.test.js:164-231`).
