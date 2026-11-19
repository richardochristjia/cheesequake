import { useEffect, useId, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  CandlestickChart,
  ChevronUp,
  Coins,
  DollarSign,
  Droplets,
  Gauge,
  Plus,
  Trash2,
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
import {
  BUTTON_TAP,
  expandCollapseVariants,
  fadeInVariants,
  staggerContainerVariants,
  staggerItemVariants,
  tooltipVariants,
} from '../lib/motion';
import { PARTS, bandInfo, explainPart } from '../lib/glossary';
import { isBoolean, isString, usePersistedState } from '../lib/tabState';
import type { WatchCoin, WatchResponse } from '../types';

const WATCH_MINT_INPUT_KEY = 'cheesequake:tab-state:watch:mint-input';
const WATCH_CHART_KEY_PREFIX = 'cheesequake:tab-state:watch:chart:';

const DEFAULT_NOTE =
  'Watched coins are scanned first on every cycle and monitored for creator sells, tracked-wallet sells, and liquidity drops even if unlisted.';

function ScoreStatTile({
  coin,
  scoreTxt,
}: {
  coin: WatchCoin;
  scoreTxt: string;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const hasBreakdown =
    coin.score !== null &&
    coin.score !== undefined &&
    Array.isArray(coin.scoreReasons) &&
    coin.scoreReasons.length > 0;

  if (!hasBreakdown) {
    return (
      <div className="rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-[#cfc3b4]">
          <Gauge aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#e59a28]" />
          <span>Score</span>
        </div>
        <div className="mt-1 truncate text-sm font-medium text-[#f4ede2]">
          {scoreTxt}
        </div>
      </div>
    );
  }

  const bi = bandInfo(coin.band);
  const byPart = new Map((coin.scoreReasons || []).map((r) => [r.part, r]));

  return (
    <div
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className="relative rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 cursor-help hover:border-[#e59a28]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e59a28]/70 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-xs text-[#cfc3b4]">
        <Gauge aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#e59a28]" />
        <span>Score</span>
      </div>
      <div className="mt-1 truncate text-sm font-medium text-[#f4ede2]">
        {scoreTxt}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            id={tooltipId}
            role="tooltip"
            variants={tooltipVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute left-0 top-full mt-1.5 z-30 w-72 max-w-[85vw] rounded-lg border border-[#2d251d] bg-[#211c16] p-3 text-xs font-normal text-[#f4ede2] shadow-xl pointer-events-none"
          >
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#2d251d] pb-1.5">
              <span className="font-semibold text-[#f4ede2]">Score breakdown</span>
              <Badge tone={bi.cls}>{bi.label}</Badge>
            </div>
            <ul className="space-y-1.5">
              {Object.keys(PARTS).map((k) => {
                const p = explainPart(k, byPart.get(k), coin.unknowns, null);
                const pts = p.level === 'No data' ? 0 : p.points;
                return (
                  <li
                    key={k}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2"
                  >
                    <span className="truncate text-[#f4ede2]/90">{p.name}</span>
                    <Badge tone={p.cls}>{p.level}</Badge>
                    <span className="text-right text-[#cfc3b4] tabular-nums">
                      {pts}/{p.max}
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WatchCard({
  coin,
  onUnwatch,
}: {
  coin: WatchCoin;
  onUnwatch: (mint: string) => void;
}) {
  const [chartOpen, setChartOpen] = usePersistedState<boolean>(
    `${WATCH_CHART_KEY_PREFIX}${coin.mint}`,
    false,
    { validate: isBoolean },
  );

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
          <AddressLink address={coin.mint} showDexScreener />
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            whileTap={BUTTON_TAP}
            aria-expanded={chartOpen}
            onClick={() => setChartOpen((o) => !o)}
            className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 min-w-[116px] min-h-[44px] rounded-lg px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              chartOpen
                ? 'bg-[#e59a28] text-[#110e0b]'
                : 'border border-[#2d251d] bg-[#211c16] text-[#f4ede2] hover:border-[#e59a28]/50'
            }`}
          >
            {chartOpen ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CandlestickChart className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {chartOpen ? 'Hide chart' : 'Show chart'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={BUTTON_TAP}
            onClick={() => onUnwatch(coin.mint)}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 min-h-[44px] rounded-lg border border-[#2d251d] bg-[#211c16] px-3.5 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#fb7185]/60 hover:text-[#fb7185] transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Unwatch
          </motion.button>
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
        <ScoreStatTile coin={coin} scoreTxt={scoreTxt} />
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

      <AnimatePresence initial={false}>
        {chartOpen && (
          <motion.div
            key="chart"
            variants={expandCollapseVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="my-3 overflow-hidden"
          >
            <iframe
              className="w-full h-[640px] min-h-[420px] resize-y rounded-lg border border-[#2d251d] bg-[#110e0b]"
              src={`https://dexscreener.com/solana/${encodeURIComponent(coin.pool || coin.mint)}?embed=1&theme=dark&trades=0&info=0`}
              title={`${coin.symbol || short(coin.mint)} live chart`}
              loading="lazy"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {alerts.length ? (
          <motion.div
            key="alerts-table"
            variants={expandCollapseVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden"
          >
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
          </motion.div>
        ) : (
          <motion.p
            key="no-alerts"
            variants={expandCollapseVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden text-xs text-[#cfc3b4]"
          >
            No alerts for this coin yet.
          </motion.p>
        )}
      </AnimatePresence>
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
  const [mintInput, setMintInput] = usePersistedState<string>(
    WATCH_MINT_INPUT_KEY,
    '',
    { validate: isString },
  );
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
          <motion.button
            type="submit"
            whileTap={BUTTON_TAP}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 min-h-[44px] rounded-lg bg-[#e59a28] px-4 py-2 text-sm font-medium text-[#110e0b] hover:bg-[#e59a28]/90 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Watch coin
          </motion.button>
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
        <motion.div
          variants={fadeInVariants}
          initial="initial"
          animate="animate"
        >
          <Card title="Watched coins">
            <EmptyState
              title="No coins watched yet"
              description="No coins watched yet. Paste a mint address above or click Watch on any coin in Narratives or Ping."
            />
          </Card>
        </motion.div>
      )}

      {!error && coins !== null && coins.length > 0 && (
        <motion.div
          variants={staggerContainerVariants}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          <AnimatePresence initial={false}>
            {coins.map((c) => (
              <motion.div
                key={c.mint}
                variants={staggerItemVariants}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.14 } }}
                layout="position"
              >
                <WatchCard coin={c} onUnwatch={handleUnwatch} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
