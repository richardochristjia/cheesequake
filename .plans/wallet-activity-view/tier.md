# Tier

TIER: M
LOOP: micro
MODE: estimate
BASE: (file list)
FILES: 4
SOURCE: 3
LINES: (not measured)
CONFIG: none
DELIVERY: pr
ORCHESTRATOR: inherit high
BASE_BRANCH: auto
BRANCH_PREFIX: none
FIXTURE: .harness/

## Signals
- why: 3 source files, no sensitive path
- sensitive: none
- user-visible: public/index.html
- tests: test/server.test.js
- changed source files without a test: src/server.js, src/score.js, public/index.html
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
