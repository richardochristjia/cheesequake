# Tier

TIER: M
LOOP: micro
MODE: estimate
BASE: (file list)
FILES: 9
SOURCE: 6
LINES: (not measured)
CONFIG: none
DELIVERY: pr
ORCHESTRATOR: inherit high
BASE_BRANCH: auto
BRANCH_PREFIX: none
FIXTURE: .harness/

## Signals
- why: 6 source files, no sensitive path
- sensitive: none
- user-visible: public/index.html
- tests: test/ping.test.js, test/score.test.js, test/server.test.js
- changed source files without a test: src/db.js, src/ping.js, src/score.js, src/server.js, src/main.js, public/index.html
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
