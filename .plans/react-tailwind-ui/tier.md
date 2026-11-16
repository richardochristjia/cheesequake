# Tier

TIER: L
LOOP: phased
MODE: estimate
BASE: (file list)
FILES: 10
SOURCE: 8
LINES: (not measured)
CONFIG: none
DELIVERY: pr
ORCHESTRATOR: inherit high
BASE_BRANCH: auto
BRANCH_PREFIX: none
FIXTURE: .harness/

## Signals
- why: declared by the user (measured M: 8 source files, no sensitive path)
- sensitive: none
- user-visible: public/index.html, client/src/App.tsx, client/src/pages/Market.tsx, client/src/pages/Watch.tsx, client/src/pages/Ping.tsx, client/src/pages/Narratives.tsx, client/src/pages/Tracer.tsx
- tests: test/ui.test.js, test/server.test.js
- changed source files without a test: src/server.js, public/index.html, client/src/App.tsx, client/src/pages/Market.tsx, client/src/pages/Watch.tsx, client/src/pages/Ping.tsx, client/src/pages/Narratives.tsx, client/src/pages/Tracer.tsx
- substantial source files (10+ changed lines): none

## Steps
1. Build — sonnet
2. Context pack — sonnet
3. Review (four angles, blast radius) — sonnet
4. Falsify — sonnet
5. Fix, once — opus
6. Simplify and deslop — sonnet
7. Spec check — sonnet
8. Verify — sonnet
9. Push and merge-request link — sonnet
10. Browser walkthrough — sonnet
11. CI status — sonnet

## Skipped
- none
