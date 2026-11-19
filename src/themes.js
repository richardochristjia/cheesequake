import { config as defaultConfig } from './config.js';

const STOP = new Set(('the and for coin token sol solana official meme pump fun inu new with you your from this that ' +
  'all are big them their every first one get own into more just made real live after around through world build built out two has meet ' +
  'any can not but our its his her who why how what when where which will would could should been were was they than then there these those ' +
  'some such only over very also about again against being below between both down during each few other same too under until while ' +
  'here now let make many most much need next once take time way well even ever still back come day find give good great keep know like ' +
  'look love may off old see use want work year yes top best first last long high low free').split(' '));

const words = (s) => `${s ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

export function keywords(t) {
  return new Set(words(`${t.name ?? ''} ${t.symbol ?? ''} ${t.description ?? ''}`));
}

// tokens: [{mint, name, symbol, description, vol_h1}] -> themes and each token's theme.
// A word seeds a theme only when some member has it in its name or symbol.
export function groupThemes(tokens, cfg = defaultConfig.theme) {
  const total = tokens.reduce((a, t) => a + (t.vol_h1 ?? 0), 0);
  const by = new Map();
  const seeded = new Set();
  for (const t of tokens) {
    for (const k of keywords(t)) {
      if (!by.has(k)) by.set(k, new Map());
      by.get(k).set(t.mint, t);
    }
    for (const k of words(`${t.name ?? ''} ${t.symbol ?? ''}`)) seeded.add(k);
  }
  const vol = (ms) => ms.reduce((a, t) => a + (t.vol_h1 ?? 0), 0);
  const cands = [...by].filter(([k, m]) => seeded.has(k) && m.size >= cfg.minTokens)
    .map(([keyword, m]) => ({ keyword, aliases: [], members: new Map(m) }))
    .sort((a, b) => b.members.size - a.members.size);
  const kept = [];
  for (const c of cands) {
    const host = kept.find((k) => {
      let n = 0;
      for (const m of c.members.keys()) if (k.members.has(m)) n++;
      return n / Math.min(c.members.size, k.members.size) >= cfg.mergeOverlap;
    });
    if (!host) { kept.push(c); continue; }
    host.aliases.push(c.keyword);
    for (const [m, t] of c.members) host.members.set(m, t);
  }
  const themes = kept.map(({ keyword, aliases, members }) => {
    const ms = [...members.values()];
    const volume = vol(ms);
    const syms = new Map();
    for (const t of ms) { const y = (t.symbol ?? '').toLowerCase(); syms.set(y, (syms.get(y) ?? 0) + 1); }
    const tags = [];
    if (Math.max(...syms.values()) / ms.length >= cfg.cloneShare) tags.push('clones');
    if (volume > 0 && Math.max(...ms.map((t) => t.vol_h1 ?? 0)) / volume >= cfg.oneCoinShare) tags.push('one coin');
    return { keyword, aliases, tags, tokens: ms.length, volume, share: total ? volume / total : 0, members: ms };
  }).sort((a, b) => (a.tags.length > 0) - (b.tags.length > 0) || b.volume - a.volume);
  const tokenTheme = new Map();
  for (const t of tokens) {
    const best = themes.filter((th) => !th.tags.length && th.members.includes(t))
      .sort((a, b) => b.tokens - a.tokens || b.volume - a.volume)[0];
    if (best) tokenTheme.set(t.mint, best.keyword);
  }
  return { themes, tokenTheme };
}

function build(db, now, config) {
  const nowS = Math.floor(now / 1000);
  const hour = Math.floor(nowS / 3600) * 3600;
  const tsT = db.prepare("SELECT MAX(ts) t FROM pool_snapshots WHERE source = 'trending'").get().t;
  const rows = db.prepare(
    `SELECT s.mint, s.symbol, s.name, s.vol_h1, s.created_at, t.description FROM pool_snapshots s LEFT JOIN tokens t ON t.mint = s.mint
     WHERE (s.source = 'trending' AND s.ts = ?) OR (s.source = 'candidate' AND s.ts > ?)`).all(tsT ?? -1, nowS - 1800);
  const seen = new Map();
  for (const r of rows) if (r.mint && !seen.has(r.mint)) seen.set(r.mint, r);
  const { themes, tokenTheme } = groupThemes([...seen.values()], config.theme);
  const prev = db.prepare('SELECT MAX(share) s FROM theme_hourly WHERE hour = ? AND keyword = ?');
  const enriched = themes.map(({ members, ...th }) => {
    const sorted = [...members].sort((a, b) => (b.vol_h1 ?? 0) - (a.vol_h1 ?? 0));
    const shares = [th.keyword, ...th.aliases].map((k) => prev.get(hour - 3600, k).s).filter((x) => x != null);
    return {
      ...th,
      prevShare: shares.length ? Math.max(...shares) : null,
      newCoins: sorted.filter((t) => t.created_at != null && nowS - t.created_at <= config.theme.newHours * 3600).length,
      leader: { mint: sorted[0].mint, symbol: sorted[0].symbol, vol_h1: sorted[0].vol_h1 ?? 0 },
      members: sorted.map((t) => ({ mint: t.mint, symbol: t.symbol, name: t.name, vol_h1: t.vol_h1 ?? 0, created_at: t.created_at })),
    };
  });
  return { themes: enriched, tokenTheme, hour };
}

// Enriched themes for the current hour: aliases, tags, newCoins, prevShare, leader, members.
export const currentThemes = (db, now, config = defaultConfig) => build(db, now, config).themes;

// Latest trending set plus current candidates -> theme_hourly and token_theme for this hour.
export function runThemes({ db, now, config = defaultConfig }) {
  const { themes, tokenTheme, hour } = build(db, now, config);
  const ins = db.prepare('INSERT OR REPLACE INTO theme_hourly(hour, keyword, tokens, volume, share) VALUES (?,?,?,?,?)');
  for (const th of themes) ins.run(hour, th.keyword, th.tokens, th.volume, th.share);
  db.exec('DELETE FROM token_theme'); // rebuilt each run; drops coins that left a theme or whose theme got tagged
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
