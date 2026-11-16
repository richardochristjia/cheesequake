## CSS glass tokens & form styles
- [x] Update `.glass-header` in `client/src/index.css` to `blur(40px) saturate(150%)` and `0.88`–`0.94` gradient scrim
- [x] Refine `.glass-card` in `client/src/index.css` to Option A (Refined 3D Bevel Glass)
- [x] Add `.glass-input` and `.glass-select` classes in `client/src/index.css`

## Form controls & button consistency
- [x] Apply `.glass-input` + `min-h-[44px]` to the mint input and unify `Show chart` / `Unwatch` to `min-h-[44px] px-3.5 py-2` in `client/src/pages/Watch.tsx`
- [x] Apply `.glass-input` + `min-h-[44px]` to the wallet input in `client/src/pages/Tracer.tsx`
- [x] Apply `.glass-input glass-select` to both `<select>` dropdowns in `client/src/pages/Ping.tsx`
- [x] Align `WatchButton` padding to `px-3.5 py-2` in `client/src/components/ui.tsx`

## Verification
- [x] `cd client && npm run build` exits 0
- [x] `cd client && npm test` passes all tests
- [x] `Show chart` / `Hide chart`, `Unwatch`, and `WatchButton` all use `min-h-[44px]` and `px-3.5 py-2`
- [x] `<input>` and `<select>` controls in `Watch.tsx`, `Tracer.tsx`, and `Ping.tsx` use `.glass-input` (plus `.glass-select` on `<select>`) and `min-h-[44px]`

## Manual checks
- [ ] `manual:` Open the dashboard in a browser, scroll cards under the sticky header, and confirm no text/card bleed-through and balanced 3D card depth
