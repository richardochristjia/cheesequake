import { readFileSync } from 'node:fs';

export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Lines: <address>[,<label>]; '#' starts a comment. Re-read every cycle.
export function loadWallets(path, warn = (m) => console.error(m)) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch {
    warn(`wallets: cannot read ${path}; tracking no wallets`);
    return [];
  }
  const seen = new Set();
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.split('#')[0].trim();
    if (!line) return;
    const [address, ...rest] = line.split(',');
    const a = address.trim();
    if (!B58.test(a)) { warn(`wallets: line ${i + 1} is not a valid address, skipped`); return; }
    if (seen.has(a)) return;
    seen.add(a);
    out.push({ address: a, label: rest.join(',').trim() || null });
  });
  return out;
}
