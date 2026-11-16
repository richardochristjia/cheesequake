# Tier

TIER: L
LOOP: phased
MODE: estimate
BASE: (file list)
FILES: 36
SOURCE: 22
LINES: (not measured)
CONFIG: none
DELIVERY: pr
ORCHESTRATOR: inherit high
BASE_BRANCH: auto
BRANCH_PREFIX: none
FIXTURE: .harness/

## Signals
- why: 22 source files
- sensitive: none
- user-visible: public/index.html
- tests: test/http.test.js, test/market.test.js, test/trades.test.js, test/ping.test.js, test/vetoes.test.js, test/scorecard.test.js, test/score.test.js, test/themes.test.js, test/outcomes.test.js, test/tracer.test.js, test/wallets.test.js, test/server.test.js
- changed source files without a test: .gitignore, data/labels.json, public/index.html, src/config.js, src/db.js, src/http.js, src/wallets.js, src/sources/geckoterminal.js, src/sources/dexscreener.js, src/sources/rugcheck.js, src/sources/solana.js, src/market.js, src/trades.js, src/ping.js, src/vetoes.js, src/scorecard.js, src/themes.js, src/score.js, src/outcomes.js, src/tracer.js, src/server.js, src/main.js
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
