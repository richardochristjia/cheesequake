# Tasks

## Phase 1: Toolchain & Server Static Serving
- [x] Initialize Vite + React + TypeScript + Tailwind CSS v4 + `lucide-react` in `client/` and update root `package.json` scripts (`dev`, `build`, `test`) and `.gitignore`
- [x] Update `src/server.js` to serve `public/dist/index.html` on `GET /` and static assets under `public/dist/` with MIME types and path-traversal guards

## Phase 2: Burnt Basque Design System & App Shell
- [x] Configure Burnt Basque theme tokens, `tabular-nums`, and `prefers-reduced-motion` styles in `client/src/index.css`
- [x] Build `App.tsx`, `Layout.tsx` (custom SVG emblem, 5-tab accessible `tablist` with icons, 30s auto-refresh), and shared UI primitives (`KindTooltip.tsx`, `EmptyState.tsx`, `lib/format.ts`, `lib/glossary.ts`, `types.ts`)

## Phase 3: Market, Watch & Ping Views
- [x] Implement `Market.tsx` and interactive `TrenchChart.tsx` SVG with 5 zone bands and hover crosshair tooltip
- [x] Implement `Watch.tsx` with Base58 validation, keyed `WatchCard` preserving lazy DexScreener iframes across refreshes, and `KIND_INFO` alert table
- [x] Implement `Ping.tsx` with alert kind and wallet filters, consensus wallet labels, `KIND_INFO` tooltips, and shared Watch toggles

## Phase 4: Narratives & Tracer Views
- [x] Implement `Narratives.tsx` with expandable plain-English score breakdowns + progress bars, theme share bars with top-5 toggle, wallet scorecard, and calibration table
- [x] Implement `Tracer.tsx` and interactive `TracerGraph.tsx` SVG DAG with curved Bezier edges, directional markers, and clickable node inspector

## Phase 5: Test Migration & Verification
- [ ] Port UI tests from `test/ui.test.js` and `test/server.test.js` (`loadDashboard`) to Vitest + React Testing Library in `client/src/__tests__/ui.test.tsx`
- [ ] Update `test/server.test.js` for `public/dist/` static serving, path-traversal guard, and `client/src` XSS static check; remove legacy `public/index.html` and `test/ui.test.js`

## Verification
- [ ] `npm run build` compiles `client/` into `public/dist/` with zero TypeScript or Vite errors
- [ ] `npm test` passes all `node --test` backend suites and all `vitest run` UI tests
- [ ] `src/server.js` serves on `127.0.0.1` only, rejects foreign `Host` (403) and path traversal (404), and `client/src` has zero `innerHTML` or `dangerouslySetInnerHTML`

## Manual checks
- [ ] manual: Open the live dashboard in a browser, verify the Burnt Basque dark theme across all 5 tabs, hover the Market Trench Index chart tooltip, toggle a Watch DexScreener chart iframe and confirm it does not reload on a 30s refresh, and click a node in the Tracer SVG graph.
