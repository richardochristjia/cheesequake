export type TabId = 'market' | 'watch' | 'ping' | 'narratives' | 'tracer';

export interface MarketHourlyRow {
  hour: number;
  index_value: number | null;
  new_pools?: number;
  grad_rate?: number;
  trending_vol?: number;
  median_liq?: number;
  avg_change?: number;
}

export interface MarketResponse {
  index: {
    value: number | null;
    zone: string;
  };
  hours: number;
  warmupHours: number;
  hourly: MarketHourlyRow[];
}

export interface AlertItem {
  ts: number;
  kind: string;
  mint: string;
  wallet: string | null;
  wallet_label?: string | null;
  symbol?: string | null;
  name?: string | null;
  image_url?: string | null;
  detail: {
    wallets?: string[];
    wallet_labels?: Record<string, string>;
    mcap?: number;
    side?: string;
    usd?: number | null;
    from?: number;
    to?: number;
    vol?: number;
    buyers?: number;
  };
}

export type WatchStatus = 'safe' | 'caution' | 'flag';

export interface WatchCoin {
  mint: string;
  symbol: string | null;
  name: string | null;
  pool: string | null;
  status: WatchStatus;
  label?: string;
  score: number | null;
  price_usd: number | null;
  mcap_usd: number | null;
  liquidity_usd: number | null;
  vol_h24: number | null;
  image_url: string | null;
  reasons: string[];
  alerts: AlertItem[];
}

export interface WatchResponse {
  ok?: boolean;
  coins: WatchCoin[];
}

export interface WalletOption {
  address: string;
  label?: string | null;
}

export interface PingResponse {
  alerts: AlertItem[];
  wallets: WalletOption[];
}

export interface ScoreReason {
  part: string;
  points: number;
  max: number;
  note?: string;
}

export interface RunningCoin {
  mint: string;
  symbol: string | null;
  name: string | null;
  image_url?: string | null;
  watched?: boolean;
  gem?: boolean;
  theme: string | null;
  score: number;
  band: string;
  mcap_usd: number | null;
  unknowns: string[];
  reasons: ScoreReason[];
}

export interface ThemeMember {
  mint: string;
  symbol: string | null;
  name: string | null;
  vol_h1: number;
  created_at: number | null;
}

export interface ThemeRow {
  keyword: string;
  aliases: string[];
  tags: string[];
  tokens: number;
  volume: number;
  share: number;
  prevShare: number | null;
  newCoins: number;
  leader: { mint: string; symbol: string | null; vol_h1: number };
  members: ThemeMember[];
}

export interface WalletScorecardRow {
  address: string;
  label?: string | null;
  class: string;
  bought: number;
  winRate: number | null;
  medianHoldSeconds: number | null;
  stillHoldingShare: number | null;
}

export interface CalibrationRow {
  band: string;
  horizon_h: number;
  count: number;
  meanChangePct: number;
  positiveShare: number;
}

export interface NarrativesResponse {
  themes: ThemeRow[];
  running: RunningCoin[];
  wallets: WalletScorecardRow[];
  calibration: {
    rows: CalibrationRow[];
    missed?: number;
  };
}

export interface TracerNode {
  address: string;
  depth: number;
  label?: string | null;
  type?: string | null;
}

export interface TracerEdge {
  from: string;
  to: string;
  usd: number;
}

export interface TracerResponse {
  status: string;
  error?: string;
  nodes: TracerNode[];
  edges: TracerEdge[];
}
