# Correctness Review — `narratives-beginner`

- **Mode:** Single-angle review (**Correctness** only, per `interrogate` one-angle mode).
- **Context pack:** `.plans/narratives-beginner/context-pack.md` (commit `d8827cb` on `narratives-beginner`, branched from `cheesequake` `8793b8f`).
- **Scope read:** `.plans/narratives-beginner/{context-pack.md,plan.md,design.md,diff-ui.patch,diff-tests.patch}`, `public/index.html`, `test/server.test.js`, `src/{score.js,vetoes.js,config.js,server.js,scorecard.js,outcomes.js,themes.js,market.js}`, `.agents/RECORD.md`.
- **Critical findings:** None.

### Intent
> Rewrite the Narratives tab in `public/index.html` into beginner-readable plain language (`Running now` first as a responsive CSS grid with an expandable 6-part score breakdown, `Themes this hour` capped at 5 rows with a toggle, plain band/wallet/unknown labels, mobile two-column cards with 44 px buttons, `:focus-visible` ring, and initial loading state) while leaving backend APIs and scoring untouched, backed by `vm`-sandboxed DOM unit tests in `test/server.test.js` (`plan.md`, `context-pack.md`).

### Reviewers
- Reviewer A (Correctness): 0 Act on, 3 Consider, 3 Noted, 3 Dismissed.

### Act On
None. No blocking correctness defects were found in `public/index.html` or `test/server.test.js` (`npm test`: 55/55 passing; `PARTS`, `BANDS`, and `UNKNOWNS` match `src/config.js`, `src/vetoes.js`, and `src/score.js`; `textContent`-only DOM construction and `B58` link validation hold; `openMints` and `showAllThemes` survive refreshes; `market`, `ping`, and `tracer` pass live-server checks).

### Consider
1. **Tab-switch error race in `refresh()` (`public/index.html:388-395`)** — Correctness.
   `refresh()` reads module-level `current` inside `.catch((e) => put(current, ...))` rather than capturing the tab at invocation time. If tab A's fetch is pending when the user switches to tab B and tab A then rejects, the error message overwrites tab B's rendered DOM. (Pre-existing on line 395, surfaced by the new `show()` loading flow.)
   *Proof (`node -e` against `public/index.html` `<script>`):* Calling `show('market')` with a pending `/api/market` promise, then `show('narratives')` (which renders `"Running now..."`), then rejecting `/api/market` with `new Error('market timeout')` overwrites `#narratives` `textContent` with `"Could not load: market timeout"`.
   *Tradeoff:* Two-line fix (`const tab = current; return TABS[tab]().catch((e) => put(tab, ...))`), low risk, but pre-existing outside the Narratives tab.

2. **`renderThemes` toggle lacks `aria-expanded` and drops focus on click (`public/index.html:296-316`)** — Correctness / Accessibility.
   Unlike `renderRunning`'s `"Explain score"` button (`public/index.html:261,288`), the `"Show all N themes"` / `"Show top 5"` button sets no `aria-expanded` attribute, and `toggle.onclick` calls `wrap.replaceChildren(...kids)`, destroying and recreating the button element on every click (dropping keyboard focus to `<body>`).
   *Proof:* `public/index.html:309-313` creates a new `<button class="go quiet more">` inside `draw()` and calls `wrap.replaceChildren(...kids)` inside `toggle.onclick`, whereas `renderRunning` (`public/index.html:281-289`) mutates `why.hidden`, `btn.textContent`, and `btn.setAttribute('aria-expanded', ...)` in place.
   *Tradeoff:* Adding `aria-expanded` is trivial; keeping focus requires toggling rows or re-focusing the replacement button.

3. **Inconsistent `undefined` guard on wallet percentages (`public/index.html:336-338`)** — Correctness.
   Line 337 checks `w.medianHoldSeconds === null || w.medianHoldSeconds === undefined`, whereas lines 336 and 338 only check `=== null` before computing `w.winRate * 100` and `w.stillHoldingShare * 100`. Because `undefined * 100` evaluates to `NaN`, `fmt()`'s `n === null || n === undefined` guard (`public/index.html:92`) is bypassed and renders `"NaN%"`.
   *Proof (`node -e` against `public/index.html` `<script>`):* Passing `{ winRate: undefined, medianHoldSeconds: undefined, stillHoldingShare: undefined }` to `narratives()` rendered `NaN%not enough trades yetNaN%` for that row.
   *Tradeoff:* `src/scorecard.js:30-31` always returns `number | null` (never `undefined`), so real `/api/narratives` responses do not hit this; fixing `== null` is one-line defensive parity with line 337.

### Noted
- **Test coverage gaps (`test/server.test.js:158,221-230`):** The unit test checks `.hidden` and button labels on `"Explain score"`/`"Hide"`, but does not assert `aria-expanded` (verified separately via `node -e` against `src/server.js`: toggles `'false'` -> `'true'` and stays `'true'` after `narratives()` refresh). Also `test/server.test.js:158` hardcodes the 10 veto rule keys because `rules` in `src/vetoes.js:14` is private; manual check confirmed 10/10 match `src/vetoes.js:14-44`.
- **Composite summary phrasing & shared amber token (`public/index.html:39,156`):** `.mid` (`Mixed`/`OK`) and `.low` (`Weak`) both map to `var(--mid)`, relying on label text to distinguish them. `PARTS.health.levels.OK` says `"buys outnumber sells"`, which summarizes an average across 3 sub-metrics (`src/score.js:22-26`) where `surge` + `top10` can reach `>= 0.4` even if `buys_h1 <= sells_h1`.
- **Repo rules & remaining plan deliverables:** Commit `d8827cb` follows Conventional Commits (`feat(dashboard): explain narratives scores in plain language`) with no AI attribution and no reference site named; `public/index.html` uses `textContent` only (`test/server.test.js:54-62`). Still open outside this commit (`context-pack.md:50`, `plan.md:19,23-24`): `.plans/narratives-beginner/taste/after` browser gate (`consistency.mjs` + `shoot.mjs` at `1440,1024,820,768,390`) and `.agents/RECORD.md` update.

### Dismissed
- **Hardcoded `79` in cap footnote (`public/index.html:280`):** Matches `config.unknownCap` (`79`, `src/config.js:23`) and `plan.md:12`; `public/index.html` is a static file with no build step.
- **Light-mode `--acc` link contrast `3.29:1` (`public/index.html:8,32`):** Pre-existing token for `<a>`; the diff introduced `--mid: #8a5a00` (`5.93:1` on `#fff`) for `.mid`/`.low` labels and uses `--fg` (`16.88:1` light, `13.82:1` dark) for explanation sentences and `:focus-visible` rings.
- **30 s `put(current, ...)` DOM replacement dropping focus:** Pre-existing behavior across all four tabs; module-level `openMints` and `showAllThemes` preserve expanded UI state across refreshes.

### Verification Run (Read-Only)
- `npm test`: 55/55 passing (`test/server.test.js` + full suite).
- `node -e` edge-case & live-server harness: verified `explainPart` (`max === 0`, `unknowns` before `pts <= 0`, `null` `theme`, hostile `theme`/`symbol` via `TextNode`), `scoreParts` -> `explainPart` round-trip, WCAG contrast ratios, and all 4 tabs (`market`, `ping`, `narratives`, `tracer`) against `startServer()`.
