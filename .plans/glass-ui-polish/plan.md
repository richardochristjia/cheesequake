# Glass UI Polish

## Problem
The dashboard's sticky `.glass-header` (`blur(22px)`, `0.68`–`0.84` opacity) lets scrolled card content bleed through behind the title and navigation tabs. Meanwhile, `.glass-card` stacks a heavy 3-stop diagonal gradient, bright top/left bevels, and 5 box-shadows that feel overly embossed; `<input>` and `<select>` controls use opaque `#110e0b` backgrounds instead of frosted glass; and action buttons have mismatched heights (`Show chart` at `min-h-[36px]` vs `Unwatch` and `WatchButton` at `min-h-[44px]`).

## Solution
- Increase `.glass-header` backdrop blur to `blur(40px) saturate(150%)` with a darker `0.88`–`0.94` gradient scrim so scrolled content stays cleanly separated.
- Refine `.glass-card` to Option A (Refined 3D Bevel Glass): softer diagonal gradient (`rgba(255, 248, 238, 0.065)` → `rgba(36, 29, 23, 0.58)` → `rgba(20, 16, 13, 0.72)`), `blur(24px) saturate(140%)`, gentler top/left specular rim (`0.18`/`0.14`), and a 3-layer shadow stack without the dark bottom inset.
- Add shared `.glass-input` and `.glass-select` classes (`blur(16px)`, translucent fill, hairline border, `min-h-[44px]`) and apply them to `<input>` and `<select>` controls in `Watch.tsx`, `Tracer.tsx`, and `Ping.tsx`.
- Standardize `Show chart` / `Hide chart`, `Unwatch`, and `WatchButton` to `min-h-[44px]` with uniform `px-3.5 py-2` padding.

## Files
- `client/src/index.css` — update `.glass-header`, refine `.glass-card`, and add `.glass-input` / `.glass-select`.
- `client/src/components/ui.tsx` — update `WatchButton` padding to `px-3.5 py-2` alongside `min-h-[44px]`.
- `client/src/pages/Watch.tsx` — apply `.glass-input` + `min-h-[44px]` to the mint input, and unify `Show chart` / `Unwatch` to `min-h-[44px] px-3.5 py-2`.
- `client/src/pages/Tracer.tsx` — apply `.glass-input` + `min-h-[44px]` to the start-wallet input.
- `client/src/pages/Ping.tsx` — apply `.glass-input glass-select` to the kind and wallet `<select>` dropdowns.

## Acceptance criteria
1. `cd client && npm run build` (`tsc -b && vite build`) exits 0 with no TypeScript or Vite errors.
2. `cd client && npm test` (`vitest run`) passes all tests in `client/src/__tests__/ui.test.tsx`.
3. `Show chart` / `Hide chart`, `Unwatch`, and `WatchButton` all use `min-h-[44px]` and `px-3.5 py-2`.
4. `<input>` and `<select>` controls in `Watch.tsx`, `Tracer.tsx`, and `Ping.tsx` use `.glass-input` (plus `.glass-select` on `<select>`) and `min-h-[44px]`.
5. `manual:` Open the dashboard in a browser, scroll cards under the sticky header, and confirm no text/card bleed-through and balanced 3D card depth.

## Risks
- Native `<select>` option popups ignore CSS `backdrop-filter` in some browsers; mitigate by styling `<option>` elements with dark `#191511` background and `#f4ede2` text.
- Higher `blur(40px)` on the sticky header can slightly increase GPU compositing cost during fast scrolling; mitigate by keeping blur confined to the single sticky header element.

## Test plan
- `client/src/__tests__/ui.test.tsx` — existing UI rendering, Watch, Tracer, and Ping interaction tests, plus assertions on unified button and input/select classes (`cd client && npm test`).
- `cd client && npm run build` — verifies TypeScript compilation and production Vite bundle.
