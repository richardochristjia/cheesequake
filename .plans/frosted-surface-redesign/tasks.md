# Tasks

## Phase 1: Background Scene & 3D Frosted Glass System
- [x] Add `.bg-scene`, `.glass-card`, `.glass-header`, and updated `#cfc3b4` / `#ebe2d5` contrast tokens to `client/src/index.css`
- [x] Render the fixed background graphic SVG (amber orbs, grid, faceted wedges, orbital rings, contour ribbons) and `.glass-header` + `text-2xl` `h1` in `client/src/components/Layout.tsx` without removing any icons
- [x] Update `Card` in `client/src/components/ui.tsx` to use `.glass-card` 3D frosted styling and `#ebe2d5` subtitle contrast

## Phase 2: Page Contrast & Scale Polish
- [x] Scale `Market.tsx` Trench Index KPI figure to `text-[22px]` (`<= h1`) and update `#9c8f80` secondary text across `Market.tsx`, `Watch.tsx`, `Ping.tsx`, `Narratives.tsx`, and `Tracer.tsx` to `#cfc3b4` / `#ebe2d5`

## Verification
- [x] `npm run build` compiles `client/` into `public/dist/` with zero TypeScript or Vite errors
- [x] `npm test` passes all 64 `node --test` and 9 `vitest run` tests
- [x] `consistency.mjs` app gate (`--no-rhythm --no-tiles --no-visuals --no-address --widths 1440,1024,820,768,390`) passes with zero `text-contrast` or `heading-scale` FAILs and rubric after >= before (`7/10`)

## Manual checks
- [ ] manual: Open the live dashboard in a browser and confirm the 3D frosted cards, background graphics, preserved icons, and text contrast look crisp and comfortable.
