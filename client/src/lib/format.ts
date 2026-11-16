import type { AlertItem, WatchStatus } from '../types';

export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const short = (a?: string | null): string =>
  a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';

export const fmt = (n: number | null | undefined, d = 0): string =>
  n === null || n === undefined
    ? 'unknown'
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

export const when = (ts: number): string =>
  new Date(ts * 1000).toLocaleString();

export function formatAlertDetail(a: AlertItem): string {
  const d = a.detail || {};
  if (a.kind === 'consensus') {
    return `${(d.wallets || []).length} wallets, market cap ${fmt(d.mcap)}`;
  }
  if (d.side !== undefined) {
    const usdPart =
      d.usd !== undefined && d.usd !== null ? ` ($${fmt(d.usd)})` : '';
    return `creator ${d.side}${usdPart}`;
  }
  if (d.usd !== undefined && d.usd !== null) return `$${fmt(d.usd)}`;
  if (d.from !== undefined) {
    return `liquidity $${fmt(d.from)} to $${fmt(d.to)}`;
  }
  if (d.vol !== undefined && d.buyers !== undefined) {
    return `vol $${fmt(d.vol)}, buyers ${fmt(d.buyers)}`;
  }
  return '';
}

export type Tone = 'good' | 'mid' | 'low' | 'bad' | 'mut';

export const STATUS_TONE: Record<WatchStatus, Tone> = {
  safe: 'good',
  caution: 'mid',
  flag: 'bad',
};

export const STATUS_LABEL: Record<WatchStatus, string> = {
  safe: 'Safe to hold',
  caution: 'Caution',
  flag: 'Red flag',
};
