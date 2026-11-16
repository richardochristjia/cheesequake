# Tier

TIER: M
LOOP: micro
MODE: estimate
BASE: (file list)
FILES: 5
SOURCE: 5
LINES: (not measured)
CONFIG: none
DELIVERY: pr
ORCHESTRATOR: inherit high
BASE_BRANCH: auto
BRANCH_PREFIX: none
FIXTURE: .harness/

## Signals
- why: 5 source files, no sensitive path
- sensitive: none
- user-visible: client/src/index.css, client/src/components/ui.tsx, client/src/pages/Watch.tsx, client/src/pages/Ping.tsx, client/src/pages/Tracer.tsx
- tests: none
- changed source files without a test: client/src/index.css, client/src/components/ui.tsx, client/src/pages/Watch.tsx, client/src/pages/Ping.tsx, client/src/pages/Tracer.tsx
- substantial source files (10+ changed lines): none

## Steps
1. Build — sonnet
2. Context pack — sonnet
3. Correctness review (one angle) — sonnet
4. Falsify — sonnet
5. Fix, once — opus
6. Verify — sonnet
7. Push and merge-request link — sonnet
8. CI status — sonnet

## Skipped
- four-angle interrogate
- blast radius
- browser walkthrough
- simplify
- spec check
