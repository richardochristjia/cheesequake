import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  Coins,
  DollarSign,
  Droplets,
  Gauge,
} from 'lucide-react';
import {
  AddressLink,
  AlertWalletDisplay,
  Badge,
  Card,
  TokenAvatar,
} from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { KindTooltip } from '../components/KindTooltip';
import {
  B58,
  STATUS_LABEL,
  STATUS_TONE,
  fmt,
  formatAlertDetail,
  short,
  when,
} from '../lib/format';
import type { WatchCoin, WatchResponse } from '../types';

const DEFAULT_NOTE =
  'Watched coins are scanned first on every cycle and monitored for creator sells, tracked-wallet sells, and liquidity drops even if unlisted.';

function WatchCard({
  coin,
  onUnwatch,
}: {
  coin: WatchCoin;
  onUnwatch: (mint: string) => void;
}) {
  const [chartOpen, setChartOpen] = useState(false);

  const tone = STATUS_TONE[coin.status] || 'mid';
  const label = coin.label || STATUS_LABEL[coin.status] || 'Caution';
  const title = coin.symbol
    ? coin.symbol + (coin.name ? ` (${coin.name})` : '')
    : short(coin.mint);
  const reasons = coin.reasons || [];
  const alerts = coin.alerts || [];

  const scoreTxt =
    coin.score === null || coin.score === undefined
      ? 'unscanned'
      : `${coin.score}/100`;
  const priceTxt =
    coin.price_usd === null || coin.price_usd === undefined
      ? 'unknown'
      : `$${fmt(coin.price_usd, 6)}`;
  const mcapTxt =
    coin.mcap_usd === null || coin.mcap_usd === undefined
      ? 'unknown'
      : `$${fmt(coin.mcap_usd)}`;
  const liqTxt =
    coin.liquidity_usd === null || coin.liquidity_usd === undefined
      ? 'unknown'
      : `$${fmt(coin.liquidity_usd)}`;
  const volTxt =
    coin.vol_h24 === null || coin.vol_h24 === undefined
      ? 'unknown'
      : `$${fmt(coin.vol_h24)}`;

  const stats = [
    { label: 'Score', value: scoreTxt, Icon: Gauge },
    { label: 'Price', value: priceTxt, Icon: DollarSign },
    { label: 'Market cap', value: mcapTxt, Icon: Coins },
    { label: 'Liquidity', value: liqTxt, Icon: Droplets },
    { label: '24h Volume', value: volTxt, Icon: Activity },
  ];

  const borderTone =
    tone === 'good'
      ? 'border-l-[#5cd093]'
      : tone === 'bad'
        ? 'border-l-[#fb7185]'
        : 'border-l-[#f59e0b]';

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <TokenAvatar
            imageUrl={coin.image_url}
            symbol={coin.symbol}
            mint={coin.mint}
            size="md"
          />
          <h3 className="text-base font-semibold text-[#f4ede2]">{title}</h3>
          <AddressLink address={coin.mint} />
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={chartOpen}
            onClick={() => setChartOpen((o) => !o)}
            className={`min-h-[44px] rounded-lg px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              chartOpen
                ? 'bg-[#e59a28] text-[#110e0b]'
                : 'border border-[#2d251d] bg-[#211c16] text-[#f4ede2] hover:border-[#e59a28]/50'
            }`}
          >
            {chartOpen ? 'Hide chart' : 'Show chart'}
          </button>
          <button
            type="button"
            onClick={() => onUnwatch(coin.mint)}
            className="min-h-[44px] rounded-lg border border-[#2d251d] bg-[#211c16] px-3.5 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#fb7185]/60 hover:text-[#fb7185] transition-colors cursor-pointer"
          >
            Unwatch
          </button>
        </div>
      </div>

      <div
        className={`mb-3 rounded-lg border border-[#2d251d] border-l-4 ${borderTone} bg-[#211c16]/70 px-3 py-2`}
      >
        <strong className="block text-xs font-semibold text-[#f4ede2] mb-1">
          Why {label}:
        </strong>
        <ul className="list-disc pl-5 text-sm text-[#f4ede2]/90 space-y-0.5">
          {reasons.map((r, idx) => (
            <li key={idx}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 tabular-nums">
        {stats.map(({ label: statLabel, value, Icon }) => (
          <div
            key={statLabel}
            className="rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2"
          >
            <div className="flex items-center gap-1.5 text-xs text-[#cfc3b4]">
              <Icon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-[#e59a28]"
              />
              <span>{statLabel}</span>
            </div>
            <div className="mt-1 truncate text-sm font-medium text-[#f4ede2]">
              {value}
            </div>
          </div>
        ))}
      </div>

      {chartOpen && (
        <div className="my-3">
          <iframe
            className="w-full h-[640px] min-h-[420px] resize-y rounded-lg border border-[#2d251d] bg-[#110e0b]"
            src={`https://dexscreener.com/solana/${encodeURIComponent(coin.pool || coin.mint)}?embed=1&theme=dark&trades=0&info=0`}
            title={`${coin.symbol || short(coin.mint)} live chart`}
            loading="lazy"
          />
        </div>
      )}

      {alerts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#2d251d] text-left text-xs font-medium text-[#cfc3b4]">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Wallet</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2d251d]/70">
              {alerts.map((a, idx) => (
                <tr key={`${a.ts}-${a.kind}-${idx}`}>
                  <td className="py-2 pr-3 text-xs text-[#cfc3b4] whitespace-nowrap tabular-nums">
                    {when(a.ts)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <KindTooltip kind={a.kind} />
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <AlertWalletDisplay alert={a} />
                  </td>
                  <td className="py-2 text-xs text-[#f4ede2]/90 tabular-nums">
                    {formatAlertDetail(a)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-[#cfc3b4]">No alerts for this coin yet.</p>
      )}
    </Card>
  );
}

export function Watch({
  refreshTick,
  onSyncWatched,
}: {
  refreshTick: number;
  onSyncWatched: (coins: WatchCoin[]) => void;
}) {
  const [coins, setCoins] = useState<WatchCoin[] | null>(null);
  const [mintInput, setMintInput] = useState('');
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/watch');
      const data = (await res.json()) as WatchResponse;
      const list = data.coins || [];
      setCoins(list);
      onSyncWatched(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const m = mintInput.trim();
    if (!B58.test(m)) {
      setNote('That is not a valid Solana mint address.');
      return;
    }
    setMintInput('');
    setNote(DEFAULT_NOTE);
    const res = await fetch(`/api/watch?mint=${encodeURIComponent(m)}`, {
      method: 'POST',
    });
    const out = (await res.json()) as WatchResponse;
    if (out && Array.isArray(out.coins)) {
      setCoins(out.coins);
      onSyncWatched(out.coins);
    }
  };

  const handleUnwatch = async (mint: string) => {
    const res = await fetch(`/api/watch?mint=${encodeURIComponent(mint)}`, {
      method: 'DELETE',
    });
    const out = (await res.json()) as WatchResponse;
    if (out && Array.isArray(out.coins)) {
      setCoins(out.coins);
      onSyncWatched(out.coins);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Watch coins"
        subtitle="Pin coins you are holding or watching to track their hold status, red flags, live DexScreener candle chart, and dedicated ping alerts."
      >
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            placeholder="Coin mint address"
            aria-label="Coin mint address"
            className="glass-input min-h-[44px] w-full max-w-md rounded-lg px-3 py-2 text-sm text-[#f4ede2] placeholder:text-[#cfc3b4]/70"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-[#e59a28] px-4 py-2 text-sm font-medium text-[#110e0b] hover:bg-[#e59a28]/90 transition-colors cursor-pointer"
          >
            Watch coin
          </button>
        </form>
        <p className="mt-2 text-xs text-[#cfc3b4]">{note}</p>
      </Card>

      {error && (
        <Card title="Watched coins">
          <p className="text-sm text-[#fb7185]">Could not load: {error}</p>
        </Card>
      )}

      {!error && coins === null && (
        <Card title="Watched coins">
          <p className="text-sm text-[#cfc3b4]">Loading…</p>
        </Card>
      )}

      {!error && coins !== null && coins.length === 0 && (
        <Card title="Watched coins">
          <EmptyState
            title="No coins watched yet"
            description="No coins watched yet. Paste a mint address above or click Watch on any coin in Narratives or Ping."
          />
        </Card>
      )}

      {!error &&
        coins !== null &&
        coins.map((c) => (
          <WatchCard key={c.mint} coin={c} onUnwatch={handleUnwatch} />
        ))}
    </div>
  );
}
