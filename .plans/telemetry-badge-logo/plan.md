# Cheesequake Telemetry Badge Logo

## Problem
The dashboard header in `client/src/components/Layout.tsx` (lines 128–160) currently renders a generic placeholder triangle SVG, and `client/index.html` has no browser favicon. The app needs the approved **Cheesequake** brand mark ("Concept B: The Telemetry Badge" from `~/Downloads/Gemini_Generated_Image_qe5nlgqe5nlgqe5n.jpg` — concentric radar rings with crosshairs, an isometric Basque cheesecake slice with caramelized wavy amber top and cream body, and a sharp dark seismic pulse waveform) integrated as crisp vector assets.

## Solution
- Recreate Concept B ("The Telemetry Badge") as a hand-crafted, resolution-independent SVG using the Basque palette (`#211c16` badge fill, `#2d251d` border, `#e59a28` / `#b87718` caramelized amber top & crust, `#f4ede2` / `#cfc3b4` cream body & radar rings, `#110e0b` seismic pulse).
- Extract a reusable `<Logo />` component at `client/src/components/Logo.tsx` (default `36×36`, `aria-hidden="true"`, accepting optional `className` / `size` props) and render it in `client/src/components/Layout.tsx` in place of the placeholder `<svg>`, keeping the existing `Cheesequake` heading and non-advice disclaimer subtitle.
- Add `client/public/favicon.svg` with the same Telemetry Badge SVG and wire `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` in `client/index.html`.
- Rebuild `public/dist/` via `npm run build` so `src/server.js` serves the updated bundle and `/favicon.svg`.

## Files
- `client/src/components/Logo.tsx` — create reusable `<Logo />` SVG component rendering the Telemetry Badge.
- `client/src/components/Layout.tsx` — replace inline placeholder `<svg>` (lines 128–160) with `<Logo />`.
- `client/public/favicon.svg` — create standalone SVG favicon matching the Telemetry Badge.
- `client/index.html` — add `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` in `<head>`.
- `client/src/__tests__/ui.test.tsx` — add unit test verifying the header renders the `<Logo />` SVG alongside the `Cheesequake` heading and disclaimer.
- `public/dist/` — regenerated production assets from `npm run build` (including `public/dist/favicon.svg` and updated `public/dist/index.html`).

## Acceptance criteria
1. `client/src/components/Layout.tsx` renders `<Logo />` (`36×36`, `aria-hidden="true"`) beside the `Cheesequake` heading and existing disclaimer subtitle (`npm --prefix client test`).
2. `client/index.html` includes `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`, and `npm run build` emits `public/dist/favicon.svg` and references it in `public/dist/index.html`.
3. `npm test` (both `node --test test/*.test.js` and `npm --prefix client test`) passes with zero failures.
4. `manual:` Open the dashboard in a browser (`http://127.0.0.1:4777`) and confirm the Telemetry Badge header mark (`36×36`) and browser tab favicon (`16×16`) render crisply without clipping or alignment issues.

## Risks
- **Small-size legibility**: Fine radar crosshairs and seismic pulse peaks could blur at `16×16` favicon size; keep stroke widths legible (`>=1.2` in a `36×36` or `64×64` viewBox) and avoid sub-pixel hairlines.
- **Static asset serving**: Vite's `public/` directory must be `client/public/` so `vite build` copies `favicon.svg` into `../public/dist/favicon.svg`, which `src/server.js` serves with `image/svg+xml`.

## Test plan
- `client/src/__tests__/ui.test.tsx` — verifies `<Layout />` renders the `<Logo />` SVG (`data-testid="cheesequake-logo"` or `svg[aria-hidden="true"]` with expected `viewBox`) alongside the `Cheesequake` title and disclaimer.
- Commands: `npm test` (backend `node --test test/*.test.js` + frontend Vitest suite) and `npm run build` (verifying `public/dist/favicon.svg` and `public/dist/index.html`).
