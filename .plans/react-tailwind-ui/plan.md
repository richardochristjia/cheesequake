# Cheesequake React + Tailwind UI Migration (Tier L)

## Problem

The Cheesequake dashboard currently lives in a single 650-line vanilla DOM file (`public/index.html`) served by `src/server.js:78` only on `GET /`. Imperative DOM helpers (`h()`, `sv()`, `replaceChildren()`) make visual hierarchy, smooth transitions, and rich interactive visualizations difficult to maintain. The Market Trench Index and Tracer fund-flow SVGs lack hover tooltips, zone threshold bands, and node inspection, while UI tests (`test/ui.test.js` and `test/server.test.js`) regex-extract `<script>` from `public/index.html` into `node:vm`, coupling tests to inline HTML.

## Solution

Migrate the entire frontend into a **React + TypeScript + Tailwind CSS** application under `client/`, built by Vite into `public/dist/` and served on `127.0.0.1` by `src/server.js`:

- **Burnt Basque Dark Cheesecake Theme:** Charred espresso base (`#110e0b`), toasted crust cards (`#191511`), elevated surface (`#211c16`), caramelized amber accent (`#e59a28`), mascarpone cream text (`#f4ede2`), muted cocoa (`#9c8f80`), hairline borders (`#2d251d`), tabular numerals, and restrained semantic colors (`#5cd093` safe/good, `#f59e0b` caution, `#fb7185` flag/bad). Zero generic neon/purple AI slop.
- **Laws of UX:**
  - *Visual Hierarchy & Highlighting:* KPI strip and status badges surface critical signals first (Trench Index + Zone, Watch Hold Status & Red Flags, Top Running Score).
  - *Hick's & Miller's Law:* Progressive disclosure on Running score breakdowns, collapsible DexScreener charts, capped initial theme list (top 5 with toggle).
  - *Fitts's Law:* ≥44px touch/click targets on tabs, Watch/Unwatch, and filter controls.
  - *Scanability & Craft:* `lucide-react` icons on tabs, status pills, alert kinds, and metrics; custom SVG cheesequake emblem & empty-state illustrations; subtle CSS transitions honoring `prefers-reduced-motion`.
- **Custom Interactive React SVG Visualizations:**
  - *Market:* Trench Index KPI + 30-day SVG area/line chart with Cold/Cool/Neutral/Hot/Euphoria zone bands and hover crosshair tooltip.
  - *Watch:* Hold-status cards preserving lazy DexScreener iframes across 30s refreshes, plus `KIND_INFO` alert tooltips.
  - *Ping:* Filterable wallet activity feed (kind + wallet filters), consensus wallet badges, and Watch toggles.
  - *Narratives:* Running-now expandable plain-English score breakdowns with progress bars, Themes horizontal share bars, Wallet Scorecard table, and Calibration table.
  - *Tracer:* Interactive SVG fund-flow DAG with curved Bezier edges, directional arrowheads, node-type color coding, and clickable node inspector.

## Phases

### Phase 1: Toolchain & Server Static Serving
Initialize Vite + React 19 + TypeScript + Tailwind CSS v4 + `lucide-react` in `client/`, configuring Vite to output production assets to `../public/dist` and proxy `/api` to `http://127.0.0.1:4100` in dev mode. Update root `package.json` scripts (`build`, `dev`, `test`) and `.gitignore` (`node_modules`, `public/dist`). Extend `src/server.js` to serve `public/dist/index.html` on `GET /` and static assets under `public/dist/` with strict MIME-type mapping and `path.resolve` traversal protection.

### Phase 2: Burnt Basque Design System & App Shell
Configure Burnt Basque CSS custom properties and Tailwind `@theme` tokens in `client/src/index.css`, including `tabular-nums` utilities and `prefers-reduced-motion` transition guards. Build the persistent header with a custom SVG cheesequake emblem, 5-tab accessible `role="tablist"` navigation with `lucide-react` icons, 30-second auto-refresh polling with manual refresh button and last-updated timestamp, and shared UI primitives (`Card`, `Badge`, `KindTooltip`, `EmptyState` with custom SVG artwork, `AddressLink`).

### Phase 3: Market, Watch & Ping Views
Implement:
- `Market.tsx`: Trench Index KPI card with zone pill and `TrenchChart.tsx` (custom SVG with 5 zone bands, gradient area fill, and pointer hover crosshair + tooltip).
- `Watch.tsx`: Mint input form with Base58 validation, `WatchCard.tsx` keyed by `mint` so open DexScreener `<iframe>` elements stay mounted in-place across 30s refreshes, status reason banner, and `KIND_INFO` alert table.
- `Ping.tsx`: Alert kind (`'' | 'buy' | 'sell' | 'consensus' | 'exit'`) and wallet dropdown filters, enriched wallet labels, consensus wallet lists, `KIND_INFO` tooltips, and Watch/Unwatch action buttons synced with shared `watchedSet` state.

### Phase 4: Narratives & Tracer Views
Implement:
- `Narratives.tsx`: Running-now list with expandable plain-English score breakdowns (`PARTS`, `BANDS`, `UNKNOWNS`, `explainPart` logic preserved identically) and per-part progress bars; Themes horizontal share bars with top-5 / show-all toggle; Wallet Scorecard table; Calibration table.
- `Tracer.tsx`: Wallet address input with Base58 validation and `TracerGraph.tsx` (custom SVG DAG with curved cubic Bezier edges, directional markers, node-type border accents for `exchange`/`mixer`/`other`, and clickable node detail panel).

### Phase 5: Test Migration & Verification
Configure Vitest + `@testing-library/react` + `jsdom` in `client/`. Port all UI tests from `test/ui.test.js` and `loadDashboard` tests from `test/server.test.js` into `client/src/__tests__/`. Keep backend HTTP, static-serving, path-traversal, foreign-Host, and XSS static-guard tests in `test/server.test.js` under `node --test`. Update `npm test` to run both `node --test` and `vitest run`. Remove legacy `public/index.html` once `public/dist/` is verified.

## Acceptance Criteria

1. `npm run build` compiles `client/` into `public/dist/` with zero TypeScript or Vite errors.
2. `npm test` passes all backend `node --test` suites and all Vitest + React Testing Library UI tests, preserving all existing assertions for `KIND_INFO` tooltips, XSS safety, Watch/Ping/Narratives state & filtering.
3. `src/server.js` serves the React bundle on `127.0.0.1` only, returns 403 on foreign `Host` headers, returns 404 on path traversal (`/assets/../../package.json`), and `client/src` contains zero `innerHTML` or `dangerouslySetInnerHTML` assignments.
4. `manual: Open the live dashboard in a browser, verify the Burnt Basque dark theme across all 5 tabs, hover the Market Trench Index chart tooltip, toggle a Watch DexScreener chart iframe and confirm it does not reload on a 30s refresh, and click a node in the Tracer SVG graph.`

---

## 1. Dialectical Outcomes (Why)

- **Vite + React + TypeScript (`client/` -> `public/dist/`) over zero-build `htm` + CDN:** Zero-build CDN breaks offline/local-first reliability, lacks TypeScript and Tailwind purging, and causes FOUC. Compiling to `public/dist/` preserves the single-process `node src/main.js` production footprint.
- **Burnt Basque Dark Theme over generic light/dark SaaS:** User requested a dark cheesecake-inspired theme. Burnt Basque (`#110e0b` / `#191511` / `#e59a28` / `#f4ede2`) evolves Cheesequake's existing amber identity without neon/purple AI slop.
- **Custom Interactive React SVGs over Recharts/charting libraries:** Avoids bundle bloat and gives exact control over Trench Index zone bands and the Tracer fund-flow DAG.
- **Vitest + React Testing Library over `node:vm` regex-parsing:** `node:vm` cannot execute JSX/TSX modules; RTL tests real React component rendering and state preservation in `jsdom`.

## 2. Relevant Files (Where)

- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/package.json` (modify scripts, add devDependencies/build)
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/.gitignore` (ignore `node_modules/`, `public/dist/`)
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/src/server.js` (serve `public/dist/` index + static assets safely)
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/public/index.html` (remove after migration)
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/package.json` or root `package.json` + `client/vite.config.ts`, `client/tsconfig.json`, `client/index.html`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/index.css`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/types.ts`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/lib/format.ts`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/lib/glossary.ts`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/components/Layout.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/components/KindTooltip.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/components/TrenchChart.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/components/TracerGraph.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/components/EmptyState.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/pages/Market.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/pages/Watch.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/pages/Ping.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/pages/Narratives.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/pages/Tracer.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/App.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/main.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/client/src/__tests__/ui.test.tsx`
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/server.test.js` (update static-serving & XSS checks; remove `loadDashboard` `node:vm` tests moved to RTL)
- `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/test/ui.test.js` (remove after porting all cases to `client/src/__tests__/ui.test.tsx`)

## 3. Key Code Context (What)

`src/server.js` API routes & static serving:
```js
const PAGE = new URL('../public/index.html', import.meta.url);
// API routes:
// GET /api/market -> { index: { value, zone }, hours, warmupHours, hourly: [{ hour, index_value, ... }] }
// GET /api/watch  -> { coins: [{ mint, symbol, name, pool, status, label, score, price_usd, mcap_usd, liquidity_usd, reasons, alerts }] }
// POST|DELETE /api/watch?mint=<B58> -> { ok: true, coins }
// GET /api/ping?kind=&wallet= -> { alerts, wallets }
// GET /api/narratives -> { themes, running, wallets, calibration }
// GET /api/tracer?wallet=<B58> -> { status, error?, nodes, edges }
```

`src/server.js:63` DNS rebinding guard (must remain intact):
```js
if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) return send(403, { error: 'forbidden host' });
```

## 4. Implementation Algorithm (How)

1. **Static Asset Serving (`src/server.js`):**
   - Resolve `DIST_DIR = path.resolve(fileURLToPath(new URL('../public/dist', import.meta.url)))`.
   - For `GET /`, serve `path.join(DIST_DIR, 'index.html')` with `text/html; charset=utf-8`.
   - For `GET /assets/*` (or any non-`/api/*` GET path), normalize and `path.resolve(DIST_DIR, '.' + url.pathname)`, verify `resolved.startsWith(DIST_DIR + path.sep)` (else 404), check file exists & is file (else 404), and serve with MIME type (`.js` -> `application/javascript`, `.css` -> `text/css`, `.svg` -> `image/svg+xml`, `.png` -> `image/png`, `.json` -> `application/json`, `.woff2` -> `font/woff2`).
2. **Shared Watched State (`App.tsx`):**
   - Maintain `watchedSet: Set<string>` in top-level `App` state, hydrated on mount via `GET /api/watch` and updated on every `POST`/`DELETE /api/watch`, so `Watch`, `Ping`, and `Narratives` share consistent `Watch` / `Watching` button states.
3. **Iframe Preservation (`Watch.tsx`):**
   - Render each watched coin in a keyed `<WatchCard key={coin.mint} coin={coin} ... />` component where `chartOpen` state lives inside `WatchCard` (or a `Set<string>` in `Watch` state). Because React reconciles by `key={coin.mint}`, 30s data refreshes update props without unmounting the `<iframe>`.
4. **Plain-English Score Explanation (`glossary.ts` & `Narratives.tsx`):**
   - Port `PARTS`, `BANDS`, `UNKNOWNS`, `LEVEL_CLS`, and `explainPart(key, reason, unknowns, theme)` verbatim from `public/index.html:383-493` so every weight, band, and wording matches `src/config.js` and `test/server.test.js` expectations.

## 5. Anti-Goals (Out of Scope)

- No changes to backend scoring, vetoes, alert logic, SQLite schema, or `/api/*` JSON contracts.
- No login, authentication, or external backend calls.
- No heavy charting libraries (Recharts, Chart.js) or UI component kits (MUI, Chakra).
- No generic neon/purple gradient "AI slop".

## 6. Edge Cases & Gotchas

- **XSS Safety:** Never use `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, or `document.write`. All API strings (including hostile token names like `<img src=x onerror=alert(1)>`) must render via React JSX text nodes.
- **Prototype-pollution / `Object.hasOwn`:** Use `Object.hasOwn(KIND_INFO, kind)` in `KindTooltip` so keys like `'toString'` or `'constructor'` do not match `Object.prototype` properties.
- **Path Traversal in `src/server.js`:** `url.pathname` must be decoded/resolved and strictly checked against `DIST_DIR + path.sep` before reading from disk.
- **Iframe Reloads:** Do not pass changing query params or recreate keys on `WatchCard` during 30s polling.

## 7. Navigation Anchors

- Server entry: `src/server.js` (`createServer`)
- Frontend entry: `client/src/main.tsx` -> `client/src/App.tsx`
- Glossary & score logic: `client/src/lib/glossary.ts`
- Tests: `test/server.test.js`, `client/src/__tests__/ui.test.tsx`

## 8. Dependency Mappings

- Runtime dependencies (bundled by Vite into `public/dist/`): `react`, `react-dom`, `lucide-react`
- Dev dependencies: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`

## 9. Test Strategies

- **Phase 1:** Run `npm run build` and verify `public/dist/index.html` + `public/dist/assets/*` are generated and served by `src/server.js` with `test/server.test.js` (200 on `/`, 200 on `/assets/*`, 403 on foreign `Host`, 404 on `/assets/../../package.json`).
- **Phase 2-4:** Write Vitest + RTL tests covering `Market`, `Watch`, `Ping`, `Narratives`, `Tracer`, and `KindTooltip` (all 7 `KIND_INFO` kinds, `'toString'`, `null`, hostile HTML string, open iframe preservation on refresh, wallet+kind filter composition, expanded score rows across refresh).
- **Phase 5:** Run full `npm test` (`node --test && vitest run`) and `npm run build` with zero failures.
