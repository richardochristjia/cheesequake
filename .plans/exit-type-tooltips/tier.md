# Tier

TIER: S
LOOP: micro
MODE: estimate
BASE: (file list)
FILES: 2
SOURCE: 1
LINES: (not measured)
CONFIG: none
DELIVERY: pr
ORCHESTRATOR: inherit high
BASE_BRANCH: auto
BRANCH_PREFIX: none
FIXTURE: .harness/

## Signals
- why: one source file, no sensitive path, and it has a test
- sensitive: none
- user-visible: public/index.html
- tests: test/ui.test.js
- changed source files without a test: public/index.html
- substantial source files (10+ changed lines): none

## Steps
1. Build (implement, unit test, lint, commit) — sonnet
2. Push and merge-request link — sonnet
3. CI status — sonnet

## Skipped
- plan
- context pack
- review
- browser walkthrough
