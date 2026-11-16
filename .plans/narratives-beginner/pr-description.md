# Narratives tab a beginner can read

## Summary

- Reordered the Narratives tab in `public/index.html` to show **Running now** first, followed by **Themes this hour** (capped at 5 rows with a `"Show all"` / `"Show top 5"` toggle), **Best calls: wallet scorecard** (`"unknown"` changed to `"not enough trades yet"`), and **Calibration**, each with a one-sentence `.lead`.
- Added an inline client-side glossary in `public/index.html` covering all `config.weights` score parts (`wallets`, `health`, `deployer`, `liquidity`, `momentum`, `narrative`), all `config.bands` readings (`Strong`, `Promising`, `Mixed`, `Weak`, `Very weak`), and all missing-data keys with plain names and score-tier sentences (`Good`, `OK`, `Weak`, `None`, `No data`).
- Rebuilt **Running now** as a responsive CSS grid with `"Explain score"` / `"Hide"` buttons that expand a six-row breakdown panel (level tag, plain sentence, and `x of y` points) and missing-data cap footnote (`79`), preserving open rows and theme expansion across 30 s refreshes.
- Added `@media (max-width:700px)` stacked two-column mobile cards with `data-l` labels and full-width ≥44 px buttons, ≥7:1 explanation sentence contrast, high-contrast `:focus-visible` rings, and `"Loading…"` placeholders before first fetch.
- Added unit tests in `test/server.test.js` for glossary parity with `config.weights` and `config.bands`, `"No data"` vs `"None"` selection, missing symbol/theme fallbacks, and refresh state preservation, and updated `.agents/RECORD.md`.

## How it was tried

- Ran `npm test` (`55/55` passing, including `textContent`-only DOM construction checks and `vm`-sandboxed unit tests in `test/server.test.js`).
- Checked the rendered Narratives tab in headless Chrome against a seeded local server at `1440`, `1024`, `820`, `768`, and `390` px widths via `consistency.mjs` (`--no-rhythm --no-tiles --no-visuals --no-address`) and `shoot.mjs`, alongside live-server checks on Market, Ping, and Tracer tabs (`review.md`).

| Check | Before | After | Notes |
|---|---|---|---|
| `consistency.mjs` FAIL (raw) | 24 | 13 | 0 app-filter FAILs; raw FAILs are `no-visual`, `copy-actions`, and `action-repeat` (x3) |
| `consistency.mjs` WARN (raw) | 123 | 127 | Warnings across 5 widths |
| `shoot.mjs` rubric | 4/10 | 9/10 | Meets ≥ 4/10 gate |

Screenshots (`.plans/narratives-beginner/taste/after/`):
- `.plans/narratives-beginner/taste/after/narratives-1440.png`
- `.plans/narratives-beginner/taste/after/narratives-1024.png`
- `.plans/narratives-beginner/taste/after/narratives-820.png`
- `.plans/narratives-beginner/taste/after/narratives-768.png`
- `.plans/narratives-beginner/taste/after/narratives-390.png`

Commands to try locally:

```sh
npm test
npm start
```

## Needs your call

1. **No git remote configured (`branch narratives-beginner, not pushed`):** `git remote -v` returned no remotes and no CI config exists in the repo, so `narratives-beginner` remains local. Add a remote, push `narratives-beginner`, and open the PR using this description.
2. **Tab-switch error race in `refresh()` (`public/index.html:388-395`, from `review.md`):** `refresh()` reads module-level `current` inside `.catch()`, so switching tabs while a pending fetch rejects overwrites the newly active tab with `"Could not load: …"`.
3. **`renderThemes` toggle lacks `aria-expanded` and drops focus (`public/index.html:296-316`, from `review.md`):** `toggle.onclick` rebuilds the container with `wrap.replaceChildren(...kids)`, destroying the button and dropping keyboard focus.
4. **Wallet scorecard `undefined` guard (`public/index.html:336-338`, from `review.md`):** `winRate` and `stillHoldingShare` guard `=== null` rather than `== null`, which would render `"NaN%"` on `undefined` (`src/scorecard.js` currently returns `number | null`).
5. **`consistency.mjs` raw `action-repeat` FAIL (x3):** Repeated `"Explain score"` buttons across **Running now** rows trip the page-oriented `action-repeat` rule (13 raw FAILs total; 0 app-filter FAILs).
