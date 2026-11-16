# 3D Frosted Burnt Basque Polish (Tier M)

## Problem
In the current Burnt Basque UI (`#110e0b` ground, `#191511` flat cards), cards blend into the background, muted body/subtitle text (`#9c8f80`) measures 5.75:1 (failing `consistency.mjs` 7:1 body-text contrast), and the Market KPI figure (48px) exceeds the `h1` (18px).

## Solution
- Keep the locked Burnt Basque color system and all `lucide-react` icons intact.
- Add a fixed `pointer-events-none` background graphic layer (`radial-gradient` amber orbs, subtle architectural grid, faceted light wedges, orbital rings, and seismic contour ribbons) behind the content so frosted glass cards visibly refract it.
- Upgrade `Card` and the sticky header to 3D frosted glass: diagonal sheen (`rgba(255,248,238,0.11)` -> `rgba(56,46,36,0.56)` -> `rgba(30,24,19,0.72)`), `backdrop-blur-[22px] backdrop-saturate-[145%]`, bright top/left specular bevels, and deep 3D elevation + inset shadows.
- Raise secondary text contrast to `#ebe2d5` (subtitles/body) and `#cfc3b4` (captions/labels), and set `h1` to `24px` (`text-2xl`) above the Market KPI (`22px`).

## Files
- `client/src/index.css`: Add Burnt Basque 3D glass utility classes (`.glass-card`, `.glass-header`, `.bg-scene`), updated `--mut` (`#cfc3b4`), and `prefers-reduced-motion` guards.
- `client/src/components/Layout.tsx`: Render the fixed background SVG/gradient scene, apply `.glass-header`, raise `h1` to `text-2xl`, and keep all tab/refresh icons.
- `client/src/components/ui.tsx`: Apply `.glass-card` 3D frosted styling to `Card` and raise subtitle/muted text to `#ebe2d5` / `#cfc3b4`.
- `client/src/pages/Market.tsx`, `Watch.tsx`, `Ping.tsx`, `Narratives.tsx`, `Tracer.tsx`: Scale Market KPI figure to `text-[22px]` (`<= h1`) and update `#9c8f80` secondary text to `#cfc3b4` / `#ebe2d5`.

## Acceptance Criteria
1. `npm run build` compiles `client/` to `public/dist/` with zero TypeScript or Vite errors.
2. `npm test` passes all 64 `node --test` and 9 `vitest run` tests.
3. Gate (app): `consistency.mjs` (`--no-rhythm --no-tiles --no-visuals --no-address --widths 1440,1024,820,768,390`, ignoring page rules `cta`, `copy-headline`, `effects-fit`, `copy-fact`, `copy-actions`) reports zero `text-contrast` or `heading-scale` FAILs, with after rubric >= before (`7/10`).
4. `manual: Open the live dashboard in a browser and confirm the 3D frosted cards, background graphics, preserved icons, and text contrast look crisp and comfortable.`

## Risks
- `backdrop-filter: blur(22px)` over scrolling tables can add GPU composite cost; mitigated by keeping the background SVG static (`position: fixed; pointer-events-none`) and honoring `prefers-reduced-motion`.

## Test Plan
- `npm run build && npm test` verifies TypeScript, Vite bundle, 64 backend tests, and 9 Vitest RTL UI tests.
- `consistency.mjs` app gate + `shoot.mjs` verifies contrast, heading scale, and zero layout regressions across `1440,1024,820,768,390`.
