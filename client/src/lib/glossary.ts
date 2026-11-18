import type { ScoreReason } from '../types';
import type { Tone } from './format';

export const KIND_INFO: Record<string, string> = {
  buy: 'A tracked wallet bought this coin.',
  sell: 'A tracked wallet sold this coin.',
  consensus:
    'Multiple non-sniper tracked wallets bought this coin within a short window.',
  exit_deployer:
    'The creator (deployer) wallet sold or moved tokens — a common rug or abandonment warning.',
  exit_wallet: 'A tracked wallet sold this coin after it was listed.',
  exit_liquidity:
    'Pool liquidity dropped sharply compared with an earlier snapshot, raising slippage or rug risk.',
  exit_divergence:
    'Trading volume rose while unique buyers fell — a sign of wash trading or thinning demand.',
};

type PartLevel = 'Good' | 'OK' | 'Weak' | 'None' | 'No data';

interface PartDef {
  name: string;
  max: number;
  levels: Record<PartLevel, string | ((theme?: string | null) => string)>;
}

export const PARTS: Record<string, PartDef> = {
  wallets: {
    name: 'Wallets you follow',
    max: 20,
    levels: {
      Good: 'Multiple tracked wallets hold this coin.',
      OK: 'Some tracked wallets hold this coin.',
      Weak: 'A small amount of tracked-wallet interest, not a strong signal.',
      None: 'None of the wallets you track hold this coin.',
      'No data': 'Could not check tracked wallets.',
    },
  },
  health: {
    name: 'Buyer health',
    max: 31,
    levels: {
      Good: 'New buyers are arriving quickly, buys lead sells, and top holders own a small share.',
      OK: 'New buyers are arriving, buys outnumber sells, and the 10 biggest holders do not own too much.',
      Weak: 'Buyer growth, buy-to-sell balance, or holder spread is weak.',
      None: 'Buyer growth, buy share, and holder spread all scored zero.',
      'No data': 'Missing buyer counts or top-holder data.',
    },
  },
  deployer: {
    name: 'Creator',
    max: 13,
    levels: {
      Good: 'The person who made the coin still holds some and has not been seen selling.',
      OK: 'The person who made the coin has not been seen selling, but holds none of it now.',
      Weak: 'Creator holding or selling signals are weak.',
      None: 'The person who made the coin has been seen selling.',
      'No data': 'The creator address is not available.',
    },
  },
  liquidity: {
    name: 'Easy to sell',
    max: 19,
    levels: {
      Good: 'There is enough money in the trading pool, and it is locked so nobody can pull it out.',
      OK: 'The trading pool has moderate depth or lock coverage.',
      Weak: "The trading pool is thin compared with the coin's size, so selling may move the price.",
      None: 'The trading pool has no usable depth or lock score.',
      'No data': 'Could not check pool depth or whether liquidity is locked.',
    },
  },
  momentum: {
    name: 'Momentum',
    max: 31,
    levels: {
      Good: 'Trading in the last hour is much faster than its 6-hour pace.',
      OK: 'Trading in the last hour is picking up compared with its 6-hour pace.',
      Weak: 'Trading in the last hour is only slightly above its 6-hour pace.',
      None: 'Trading in the last hour is at or below its 6-hour pace.',
      'No data': 'Missing 1-hour or 6-hour trading volume.',
    },
  },
  narrative: {
    name: 'Theme',
    max: 6,
    levels: {
      Good: (t) =>
        t
          ? `It belongs to the "${t}" theme, which grew this hour.`
          : 'It belongs to a theme that grew this hour.',
      OK: (t) =>
        t
          ? `It belongs to the "${t}" theme, which held steady or cooled this hour.`
          : 'It belongs to a theme that held steady or cooled this hour.',
      Weak: (t) =>
        t
          ? `It belongs to the "${t}" theme, with weak theme growth.`
          : 'It belongs to a theme with weak growth.',
      None: 'It does not share a theme word with other trending coins this hour.',
      'No data': 'Theme data was not available.',
    },
  },
};

export const BANDS: Record<string, { label: string; cls: Tone }> = {
  strong: { label: 'Strong', cls: 'good' },
  confirm: { label: 'Promising', cls: 'good' },
  neutral: { label: 'Mixed', cls: 'mid' },
  risk: { label: 'Weak', cls: 'low' },
  avoid: { label: 'Very weak', cls: 'bad' },
};

export const UNKNOWNS: Record<string, string> = {
  mint_authority: 'mint permission check',
  freeze_authority: 'freeze permission check',
  rugged: 'rug-pull check',
  transfer_fee: 'transfer fee check',
  lp_unlocked: 'locked pool check',
  top10: 'top 10 holders check',
  insiders: 'insider wallets check',
  liquidity: 'easy to sell',
  age: 'coin age check',
  wash: 'fake volume check',
  inactive: 'recent buyer count',
  wallets: 'wallets you follow',
  health: 'buyer health',
  deployer: 'creator',
  momentum: 'momentum',
  narrative: 'theme',
};

export const LEVEL_CLS: Record<PartLevel, Tone> = {
  Good: 'good',
  OK: 'mid',
  Weak: 'low',
  None: 'bad',
  'No data': 'mut',
};

export const bandInfo = (b: string | null | undefined): { label: string; cls: Tone } =>
  (b && Object.hasOwn(BANDS, b) ? BANDS[b] : { label: b || 'unknown', cls: 'mut' });

export const missingList = (xs: string[] | null | undefined): string =>
  [...new Set((xs || []).map((k) => (Object.hasOwn(UNKNOWNS, k) ? UNKNOWNS[k] : k)))].join(', ') ||
  'none';

export interface ExplainedPart {
  key: string;
  name: string;
  level: PartLevel;
  cls: Tone;
  text: string;
  points: number;
  max: number;
}

export function explainPart(
  key: string,
  reason: ScoreReason | undefined,
  unknowns: string[] | null | undefined,
  theme: string | null | undefined,
): ExplainedPart {
  const def = PARTS[key];
  const max = reason ? reason.max : def.max;
  const pts = reason ? reason.points : 0;
  const isUnknown = !reason || (unknowns || []).includes(key);
  let level: PartLevel = 'None';
  if (isUnknown) level = 'No data';
  else if (pts <= 0) level = 'None';
  else {
    const ratio = max > 0 ? pts / max : 0;
    level = ratio >= 0.75 ? 'Good' : ratio >= 0.4 ? 'OK' : 'Weak';
  }
  const raw = def.levels[level];
  const text = typeof raw === 'function' ? raw(theme) : raw;
  return {
    key,
    name: def.name,
    level,
    cls: LEVEL_CLS[level],
    text,
    points: pts,
    max,
  };
}
