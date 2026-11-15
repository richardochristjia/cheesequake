import { config as defaultConfig } from './config.js';

const STOP = new Set('the and for coin token sol solana official meme pump fun inu new with you your from this that'.split(' '));

export function keywords(t) {
  const words = `${t.name ?? ''} ${t.symbol ?? ''} ${t.description ?? ''}`.toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)));
}

// tokens: [{mint, name, symbol, description, vol_h1}] -> themes and each token's theme.
export function groupThemes(tokens, minTokens = defaultConfig.theme.minTokens) {
  const by = new Map();
  for (const t of tokens) for (const k of keywords(t)) {
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(t);
  }
  const total = tokens.reduce((a, t) => a + (t.vol_h1 ?? 0), 0);
  const themes = [...by].filter(([, ts]) => ts.length >= minTokens).map(([keyword, ts]) => {
    const volume = ts.reduce((a, t) => a + (t.vol_h1 ?? 0), 0);
    return { keyword, tokens: ts.length, volume, share: total ? volume / total : 0, mints: ts.map((t) => t.mint) };
  });
  const tokenTheme = new Map();
  for (const t of tokens) {
    const best = themes.filter((th) => th.mints.includes(t.mint))
      .sort((a, b) => b.tokens - a.tokens || b.volume - a.volume)[0];
    if (best) tokenTheme.set(t.mint, best.keyword);
  }
  return { themes, tokenTheme };
}

// Latest trending set plus current candidates -> theme_hourly and token_theme for this hour.
export function runThemes({ db, now, config = defaultConfig }) {
  const nowS = Math.floor(now / 1000);
  const hour = Math.floor(nowS / 3600) * 3600;
  const tsT = db.prepare("SELECT MAX(ts) t FROM pool_snapshots WHERE source = 'trending'").get().t;
  const rows = db.prepare(
    `SELECT s.mint, s.symbol, s.name, s.vol_h1, t.description FROM pool_snapshots s LEFT JOIN tokens t ON t.mint = s.mint
     WHERE (s.source = 'trending' AND s.ts = ?) OR (s.source = 'candidate' AND s.ts > ?)`).all(tsT ?? -1, nowS - 1800);
  const seen = new Map();
  for (const r of rows) if (r.mint && !seen.has(r.mint)) seen.set(r.mint, r);
  const { themes, tokenTheme } = groupThemes([...seen.values()], config.theme.minTokens);
  const ins = db.prepare('INSERT OR REPLACE INTO theme_hourly(hour, keyword, tokens, volume, share) VALUES (?,?,?,?,?)');
  for (const th of themes) ins.run(hour, th.keyword, th.tokens, th.volume, th.share);
  const up = db.prepare('INSERT OR REPLACE INTO token_theme(mint, keyword, hour) VALUES (?,?,?)');
  for (const [mint, kw] of tokenTheme) up.run(mint, kw, hour);
  return themes;
}

// {keyword, share, prevShare} for a mint's current theme, or null.
export function themeOf(db, mint, now) {
  const hour = Math.floor(now / 1000 / 3600) * 3600;
  const tt = db.prepare('SELECT keyword FROM token_theme WHERE mint = ? AND hour = ?').get(mint, hour);
  if (!tt) return null;
  const share = (h) => db.prepare('SELECT share FROM theme_hourly WHERE hour = ? AND keyword = ?').get(h, tt.keyword)?.share ?? 0;
  return { keyword: tt.keyword, share: share(hour), prevShare: share(hour - 3600) };
}
