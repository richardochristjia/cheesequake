## Design
- Plan folder: .plans/narratives-beginner/
- Mode: redesign · kind: app
- Look: system · kind software · palette current tokens · type system-ui · radius 8px · font swap none · history .plans/narratives-beginner/taste/
- Direction: A, Plain list · each score part is a row with a level tag, a sentence and its points
- Representation: score breakdown: status list · reading: coloured label · theme share: number · missing data: plain names
- Allowances: no-visual, fold-action — page rules, an app tab has no hero or fold action
- Idea: n/a (app screen)
- Argument and copy outline: n/a (app screen); copy is the glossary in phase 1
- Pictures: none
- Widths: 1440, 1024, 820, 768, 390 · phone layout: coin rows stack to two columns with labels, button full width, themes table unchanged
- Flow map: n/a
- States:

| Block | empty | zero | loading | error | success | no-permission |
|---|---|---|---|---|---|---|
| Running now | "Nothing has passed every safety check in the last 30 minutes." | same | "Loading…" | "Could not load: …" (exists) | rows | n/a, no login |
| Explain score | n/a | part at 0: "None" tag | n/a | n/a | six rows | n/a |
| Themes | "No themes yet." | same | "Loading…" | shared | top 5, toggle | n/a |
| Wallet scorecard | "No wallets tracked. Add some to wallets.txt." | "unknown" becomes "not enough trades yet" | "Loading…" | shared | table | n/a |
| Calibration | "No results yet. The tool checks each coin's price 1, 6 and 24 hours later." | same | "Loading…" | shared | table | n/a |

- Before: .plans/narratives-beginner/taste/before · FAIL 24 WARN 123 · rubric 4/10
- Gate (app): consistency.mjs app filter (modes/app.md) no FAIL · rubric after ≥ before
