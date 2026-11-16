# Interrogate Review — `watch-coins` (Base: `wallet-backfill`)

**Mode:** Single-angle review (`Correctness` — Correctness; Root Causes vs. Symptoms)  
**Context Pack:** Cited from `/Users/167560.KEVIN/orca/workspaces/Random Stuff/spiderfish/.plans/watch-coins/context-pack.md` (and `.plans/watch-coins/diff-ui.patch`, `.plans/watch-coins/diff-tests.patch`).

### Intent
> Persist user-watched Solana mints in SQLite (`watched_coins`), prioritize them first in `runCandidates` with full veto evaluation even when cheap vetoes fail, monitor them continuously in `deployerWallets` and `checkExits` regardless of listing status or 24-hour age, expose `/api/watch` (`GET`/`POST`/`DELETE`), and provide a dashboard `Watch` tab showing hold status badges (`Safe to hold`, `Caution`, `Red flag`), plain-English reasons, per-coin alerts, and a lazy DexScreener candle chart `<iframe>`.

### Reviewers
- Reviewer A: Correctness, 5 findings (1 Act on, 2 Consider, 1 Noted, 1 Dismissed)

---

### Act On

#### 1. `watchedSet` is never hydrated on `Narratives` or `Ping` tabs until `Watch` tab is visited (`public/index.html:132-152,246,389,522`)
- **Raised by:** Reviewer A (Correctness)
- **Why it matters:** On initial page load (`show('market')` at `public/index.html:522`), `watchedSet` starts empty (`public/index.html:132`) and is only populated inside `watch()` (`public/index.html:219`) or `toggleWatch()` (`public/index.html:143`). When a user with existing watched coins in SQLite switches to `Narratives` (`public/index.html:389`) or `Ping` (`public/index.html:246`) before opening the `Watch` tab, `watchBtn(mint, ...)` checks `watchedSet.has(mint)` (`public/index.html:148`), which returns `false` for every already-watched coin. As a result:
  1. Already-watched coins render with button label `'Watch'` and `aria-pressed="false"` instead of `'Watching'` and `aria-pressed="true"`.
  2. Clicking the button to unwatch sends `POST /api/watch` instead of `DELETE /api/watch` (`public/index.html:140`), leaving the coin watched instead of toggling it off.
- **Proof:** Run this one-liner against the existing dashboard harness from `test/server.test.js:146-198`:
  ```bash
  node -e '
  import("node:fs").then(async ({ readFileSync }) => {
    const vm = await import("node:vm");
    const assert = await import("node:assert/strict");
    const html = readFileSync("public/index.html", "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    class Node { constructor(t="") { this._text = String(t); } }
    class El extends Node {
      constructor(t) { super(); this.tagName = t.toUpperCase(); this.attrs = {}; this.dataset = {}; this.children = []; this.hidden = false; }
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === "hidden") this.hidden = true; }
      getAttribute(k) { return this.attrs[k]; }
      append(...ks) { for (const k of ks) this.children.push(k instanceof Node ? k : new Node(k)); }
      replaceChildren(...ks) { this.children = []; this.append(...ks); }
      hasChildNodes() { return this.children.length > 0; }
      get text() { return this._text + this.children.map((c) => c.text ?? c._text ?? "").join(""); }
      findAll(fn, out = []) { for (const c of this.children) { if (c instanceof El) { if (fn(c)) out.push(c); c.findAll(fn, out); } } return out; }
    }
    const els = new Map(["tabs","market","watch","ping","narratives","tracer"].map((id) => [id, new El("section")]));
    const mint = "W".repeat(4) + "1".repeat(36);
    const fetch = async (url) => ({
      json: async () => url === "/api/watch"
        ? { coins: [{ mint, status: "safe", label: "Safe to hold", reasons: [], alerts: [] }] }
        : url === "/api/narratives"
          ? { running: [{ mint, symbol: "WTC", score: 80, band: "strong", mcap_usd: 100000, unknowns: [], reasons: [] }], themes: [], wallets: [], calibration: { rows: [], missed: 0 } }
          : { index: { value: null, zone: "Neutral" }, hours: 0, warmupHours: 168, hourly: [] }
    });
    const document = { createElement: (t) => new El(t), createElementNS: (_, t) => new El(t), createTextNode: (t) => new Node(t), getElementById: (id) => els.get(id), querySelectorAll: () => els.get("tabs").children };
    const { narratives } = vm.runInNewContext(`${script}\n;({ narratives })`, { Node, document, fetch, setInterval: () => {}, encodeURIComponent, Object, Set, Map, Array, Number, String, Math, Date, RegExp, URL });
    await narratives();
    const btns = els.get("narratives").findAll((e) => e.tagName === "BUTTON");
    const watchBtn = btns.find((b) => b.text === "Watch" || b.text === "Watching");
    assert.equal(watchBtn.text, "Watching"); // FAILS: actual is "Watch"
  });
  '
  ```
  Running this command fails with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 'Watch' !== 'Watching'`. Hydrating `watchedSet` on startup (or fetching `/api/watch` / including watched state when rendering) makes it pass.

---

### Consider

#### 1. `watchList` checks recent exit alerts on the `LIMIT 50` UI slice rather than querying recent exit alerts directly (`src/score.js:194,200,204-209`)
- **Raised by:** Reviewer A (Correctness)
- **Tradeoff:** `getAlerts` (`src/score.js:194`) selects the latest 50 alerts of *any* kind (`buy`, `sell`, `consensus`, `exit_*`) for a mint, and `hasAlert` (`src/score.js:204-205`) checks only within that 50-row slice. If a watched coin triggers `exit_deployer` or `exit_liquidity` and then receives 50 tracked-wallet `buy`/`sell` alerts within the same 24-hour window, the exit alert falls past `LIMIT 50` and `watchList` downgrades `status` from `'flag'` (`Red flag`) to `'safe'` (`Safe to hold`). Contrast this with `walletFacts` (`src/score.js:69`), which queries `SELECT 1 FROM alerts WHERE kind = ? AND mint = ? AND ts > ?`.
- **Proof:**
  ```bash
  node -e '
  import("./src/db.js").then(async ({ openDb }) => {
    const assert = await import("node:assert/strict");
    const { watchList } = await import("./src/score.js");
    const db = openDb(":memory:");
    const mint = "F".repeat(4) + "1".repeat(36);
    const now = 2_000_000_000_000, nowS = now / 1000;
    db.prepare("INSERT INTO watched_coins(mint, added_ts) VALUES (?,?)").run(mint, nowS - 1000);
    db.prepare("INSERT INTO candidates(ts, mint, score, band, listed, vetoes, reasons, unknowns) VALUES (?,?,80,?,1,?,?,?)").run(nowS - 60, mint, "strong", "[]", "[]", "[]");
    db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,?,?,?,?,?)").run(nowS - 3600, "exit_deployer", mint, "w", "{}", "ed");
    for (let i = 0; i < 50; i++) {
      db.prepare("INSERT INTO alerts(ts, kind, mint, wallet, detail, dedupe) VALUES (?,?,?,?,?,?)").run(nowS - 100 + i, "buy", mint, "w", "{}", "b" + i);
    }
    const [coin] = watchList(db, now);
    assert.equal(coin.status, "flag"); // FAILS: actual is "safe"
  });
  '
  ```

#### 2. `onWatch` triggers an unserialized full-universe `runCandidates` scan (`src/main.js:44-48`, `src/score.js:150-151`)
- **Raised by:** Reviewer A (Correctness)
- **Tradeoff:** While periodic jobs in `src/main.js:33-42` are serialized per timer with a `busy` flag, `onWatch` (`src/main.js:44-48`) invokes `runCandidates` directly on every `POST /api/watch`. If `POST /api/watch` arrives while the periodic `candidates` cycle is in flight (or a user clicks Watch on multiple coins in quick succession), concurrent `runCandidates` executions overlap, inserting duplicate `candidates` and `outcomes` rows for the entire 60-coin universe.

---

### Noted

- **`watchInput` in `public/index.html:134,220,226` is never updated on input:** `watchInput` is initialized to `''` and reset to `''` on submit, but `input.oninput` is never wired to save the user's in-progress text across the 30-second `setInterval(refresh, 30000)` poll (`public/index.html:523`).

---

### Dismissed

- **Redundant evaluation of `CHEAP` rules for watched mints (`src/score.js:127,140`):** `evaluate` runs `CHEAP` on line 127 and then runs all rules (`names: undefined`, which includes `CHEAP`) on line 140 before deduplicating via `new Set([...cheap.vetoes, ...rest.vetoes])`. Dismissed because `evaluate` (`src/vetoes.js:56-64`) is pure and synchronous over in-memory objects, so the duplicate check has zero behavioral or performance impact.

---

### Agreement Map
Single-angle review (`Correctness` only); cross-reviewer agreement map skipped per single-angle mode instructions.
