# Tasks — Cheesequake Telemetry Badge Logo

## Create SVG Brand Assets
- [x] Create `client/public/favicon.svg` with the Telemetry Badge SVG (Basque cheesecake slice, caramelized amber top, cream body, seismic pulse, radar rings, `#211c16` rounded square)
- [x] Create `client/src/components/Logo.tsx` exporting `<Logo />` with the matching Telemetry Badge SVG (`36×36` default, `aria-hidden="true"`)

## Integrate into Header & HTML
- [x] Replace the placeholder `<svg>` in `client/src/components/Layout.tsx` (lines 128–160) with `<Logo />`, keeping the existing `Cheesequake` heading and disclaimer subtitle
- [x] Add `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` to `client/index.html`

## Test & Build
- [x] Add a unit test in `client/src/__tests__/ui.test.tsx` verifying `<Layout />` renders `<Logo />` beside the `Cheesequake` heading and disclaimer
- [x] Run `npm run build` and verify `public/dist/favicon.svg` and `public/dist/index.html` are updated

## Verification
- [x] `client/src/components/Layout.tsx` renders `<Logo />` (`36×36`, `aria-hidden="true"`) beside the `Cheesequake` heading and existing disclaimer subtitle (`npm --prefix client test`)
- [x] `client/index.html` includes `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`, and `npm run build` emits `public/dist/favicon.svg` and references it in `public/dist/index.html`
- [x] `npm test` (both `node --test test/*.test.js` and `npm --prefix client test`) passes with zero failures

## Manual checks
- [ ] Open the dashboard in a browser (`http://127.0.0.1:4777`) and confirm the Telemetry Badge header mark (`36×36`) and browser tab favicon (`16×16`) render crisply without clipping or alignment issues
