import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AddressLink,
  Badge,
  OppRiskChips,
  Card,
  TONE_TEXT,
  TokenAvatar,
  WalletDisplay,
  WatchButton,
} from '../components/ui';
import { fmt } from '../lib/format';
import { PARTS, bandInfo, explainPart, missingList } from '../lib/glossary';
import {
  boundedStaggerDelay,
  BUTTON_TAP,
  expandCollapseVariants,
  FAST_EASE_OUT,
  staggerContainerVariants,
  staggerItemVariants,
  useRefreshHighlight,
} from '../lib/motion';
import {
  isBoolean,
  stringSetPersistence,
  usePersistedState,
} from '../lib/tabState';
import type { NarrativesResponse } from '../types';

const THIRDS = ['Low third', 'Mid third', 'High third'];
const EXTRA_PARTS: Record<string, string> = { opportunity: 'Opportunity', risk: 'Risk' };

const NARRATIVES_OPEN_MINTS_KEY = 'cheesequake:tab-state:narratives:open-mints';
const NARRATIVES_SHOW_ALL_THEMES_KEY =
  'cheesequake:tab-state:narratives:show-all-themes';
const NARRATIVES_HIDE_WATCHED_KEY =
  'cheesequake:tab-state:narratives:hide-watched';
const NARRATIVES_GEMS_ONLY_KEY = 'cheesequake:tab-state:narratives:gems-only';

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-[#cfc3b4] cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[#2d251d] bg-[#211c16] accent-[#e59a28] cursor-pointer"
      />
      {children}
    </label>
  );
}

export function Narratives({
  refreshTick,
  watchedSet,
  onToggleWatch,
}: {
  refreshTick: number;
  watchedSet: Set<string>;
  onToggleWatch: (mint: string) => void;
}) {
  const [data, setData] = useState<NarrativesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { highlightClass, triggerHighlight } = useRefreshHighlight();
  const prevTickRef = useRef(refreshTick);
  const [openMints, setOpenMints] = usePersistedState<Set<string>>(
    NARRATIVES_OPEN_MINTS_KEY,
    () => new Set(),
    stringSetPersistence,
  );
  const [showAllThemes, setShowAllThemes] = usePersistedState<boolean>(
    NARRATIVES_SHOW_ALL_THEMES_KEY,
    false,
    { validate: isBoolean },
  );
  const [openThemes, setOpenThemes] = useState<Set<string>>(() => new Set());
  const [hideWatched, setHideWatched] = usePersistedState<boolean>(
    NARRATIVES_HIDE_WATCHED_KEY,
    true,
    { validate: isBoolean },
  );
  const [gemsOnly, setGemsOnly] = usePersistedState<boolean>(
    NARRATIVES_GEMS_ONLY_KEY,
    false,
    { validate: isBoolean },
  );

  useEffect(() => {
    let active = true;
    const isTickRefresh = prevTickRef.current !== refreshTick;
    prevTickRef.current = refreshTick;

    fetch('/api/narratives')
      .then((r) => r.json() as Promise<NarrativesResponse>)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
        if (isTickRefresh) triggerHighlight();
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refreshTick, triggerHighlight]);

  const toggleMint = (mint: string) => {
    setOpenMints((prev) => {
      const next = new Set(prev);
      if (next.has(mint)) next.delete(mint);
      else next.add(mint);
      return next;
    });
  };

  if (error) {
    return (
      <Card title="Narratives">
        <p className="text-sm text-[#fb7185]">Could not load: {error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Running now">
        <p className="text-sm text-[#cfc3b4]">Loading…</p>
      </Card>
    );
  }

  const themes = data.themes || [];
  const visibleThemes = showAllThemes ? themes : themes.slice(0, 5);
  const unwatchedRunning = hideWatched
    ? data.running.filter((r) => !(r.watched || watchedSet.has(r.mint)))
    : data.running;
  const visibleRunning = gemsOnly
    ? unwatchedRunning.filter((r) => r.gem)
    : unwatchedRunning;
  const calEmpty = `No results yet. The tool checks each coin's price 1, 6 and 24 hours later.${
    data.calibration.missed ? ` Missed: ${data.calibration.missed}.` : ''
  }`;

  const hit = (v: number | null | undefined, n: number | undefined) =>
    v == null || !n ? '–' : `${fmt(v * 100)}%`;
  const partMap = new Map<string, NonNullable<NarrativesResponse['calibration']['parts']>>();
  for (const c of data.calibration.parts ?? []) {
    partMap.set(c.part, [...(partMap.get(c.part) ?? []), c]);
  }
  const partRows = [...partMap.entries()].map(
    ([part, cs]) => [part, [0, 1, 2].map((i) => cs.find((c) => c.third === i))] as const,
  );

  const renderBreakdown = (r: NarrativesResponse['running'][number]) => {
    const byPart = new Map((r.reasons || []).map((x) => [x.part, x]));
    return (
      <div className="rounded-lg border border-[#2d251d] bg-[#211c16]/70 p-4">
        <ul className="divide-y divide-[#2d251d]/70">
          {Object.keys(PARTS).map((k) => {
            const p = explainPart(k, byPart.get(k), r.unknowns, r.theme);
            const pct =
              p.max > 0 ? Math.min(100, Math.round((p.points / p.max) * 100)) : 0;
            return (
              <li
                key={k}
                className="grid grid-cols-1 sm:grid-cols-[84px_minmax(0,1fr)_auto] gap-3 items-start py-2.5 first:pt-0 last:pb-0"
              >
                <Badge tone={p.cls}>{p.level}</Badge>
                <div>
                  <strong className="block text-sm font-medium text-[#f4ede2]">
                    {p.name}
                  </strong>
                  <p className="text-xs text-[#cfc3b4] mt-0.5">{p.text}</p>
                  <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[#110e0b]">
                    <div
                      className="h-full rounded-full bg-[#e59a28]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-[#cfc3b4] whitespace-nowrap tabular-nums">
                  {p.points} of {p.max}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-[#cfc3b4]">
          Missing data counts as 0 points and caps the score at 79.
        </p>
      </div>
    );
  };

  return (
    <motion.div
      className="space-y-4"
      variants={staggerContainerVariants}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={staggerItemVariants}>
        <Card
          title="Running now"
          subtitle="Coins that passed every safety check in the last 30 minutes, best score first. The score is out of 100 and counts good signs. It is not a prediction."
          className={highlightClass}
          action={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Toggle checked={gemsOnly} onChange={setGemsOnly}>Early gems only</Toggle>
              <Toggle checked={hideWatched} onChange={setHideWatched}>Hide watched</Toggle>
            </div>
          }
        >
          {data.running.length === 0 ? (
            <p className="text-sm text-[#cfc3b4]">
              Nothing has passed every safety check in the last 30 minutes.
            </p>
          ) : visibleRunning.length === 0 ? (
            <p className="text-sm text-[#cfc3b4]">
              {gemsOnly
                ? 'No early gems right now. Turn off \u201cEarly gems only\u201d to see every running coin.'
                : 'All currently running coins are watched. Turn off \u201cHide watched\u201d to view them.'}
            </p>
          ) : (
            <>
              <div className="sm:hidden space-y-2.5">
                {visibleRunning.map((r, idx) => {
                  const isOpen = openMints.has(r.mint);
                  const bi = bandInfo(r.band);
                  const mcap =
                    r.mcap_usd === null || r.mcap_usd === undefined
                      ? 'unknown'
                      : `$${fmt(r.mcap_usd)}`;
                  return (
                    <motion.div
                      key={`m-${r.mint}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        ...FAST_EASE_OUT,
                        delay: boundedStaggerDelay(idx),
                      }}
                      className="rounded-lg border border-[#2d251d] bg-[#211c16]/70 p-3 space-y-2.5"
                    >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          <TokenAvatar
                            imageUrl={r.image_url}
                            symbol={r.symbol}
                            mint={r.mint}
                            size="sm"
                          />
                          {r.symbol ? (
                            <>
                              <strong className="font-semibold text-[#f4ede2]">
                                {r.symbol}
                              </strong>
                              <AddressLink address={r.mint} showDexScreener />
                            </>
                          ) : (
                            <strong className="font-semibold text-[#f4ede2]">
                              <AddressLink address={r.mint} showDexScreener />
                            </strong>
                          )}
                          {r.gem && <Badge tone="good">Early gem</Badge>}
                          <OppRiskChips opportunity={r.opportunity} risk={r.risk} />
                        </div>
                        <p className="mt-0.5 text-xs text-[#cfc3b4]">
                          {r.theme || 'no theme'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-semibold text-[#f4ede2] tabular-nums leading-tight">
                          {r.score}
                        </div>
                        <div className={`text-xs font-medium ${TONE_TEXT[bi.cls]}`}>
                          {bi.label}
                        </div>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div>
                        <dt className="text-[#cfc3b4]">Market cap</dt>
                        <dd className="text-sm font-medium text-[#f4ede2]/90 tabular-nums">
                          {mcap}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#cfc3b4]">Missing data</dt>
                        <dd className="text-xs text-[#f4ede2]/90">
                          {missingList(r.unknowns)}
                        </dd>
                      </div>
                    </dl>

                      <div className="flex flex-wrap items-center gap-2">
                        <motion.button
                          type="button"
                          aria-expanded={isOpen}
                          whileTap={BUTTON_TAP}
                          onClick={() => toggleMint(r.mint)}
                          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 min-w-[124px] min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                            isOpen
                              ? 'bg-[#e59a28] text-[#110e0b]'
                              : 'border border-[#2d251d] bg-[#211c16] text-[#f4ede2] hover:border-[#e59a28]/50'
                          }`}
                        >
                          {isOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Info className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {isOpen ? 'Hide' : 'Explain score'}
                        </motion.button>
                        <WatchButton
                          mint={r.mint}
                          watched={watchedSet.has(r.mint)}
                          onToggle={onToggleWatch}
                        />
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key={`m-breakdown-${r.mint}`}
                            variants={expandCollapseVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="overflow-hidden"
                          >
                            {renderBreakdown(r)}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                    <th className="py-2.5 pr-4 text-left">Coin</th>
                    <th className="py-2.5 px-3 text-left">Theme</th>
                    <th className="py-2.5 px-3 text-right">Score</th>
                    <th className="py-2.5 px-3 text-left">Reading</th>
                    <th className="py-2.5 px-3 text-right">Market cap</th>
                    <th className="py-2.5 pl-6 pr-3 text-left">Missing data</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                  <tbody className="divide-y divide-[#2d251d]/70">
                    {visibleRunning.map((r, idx) => {
                      const isOpen = openMints.has(r.mint);
                      const bi = bandInfo(r.band);
                      const mcap =
                        r.mcap_usd === null || r.mcap_usd === undefined
                          ? 'unknown'
                          : `$${fmt(r.mcap_usd)}`;
                      return (
                        <Fragment key={r.mint}>
                          <motion.tr
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              ...FAST_EASE_OUT,
                              delay: boundedStaggerDelay(idx),
                            }}
                            className="hover:bg-[#211c16]/40 transition-colors"
                          >
                          <td className="py-3 pr-4 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <TokenAvatar
                                imageUrl={r.image_url}
                                symbol={r.symbol}
                                mint={r.mint}
                                size="sm"
                              />
                              {r.symbol ? (
                                <>
                                  <strong className="font-semibold text-[#f4ede2]">
                                    {r.symbol}
                                  </strong>
                                  <AddressLink address={r.mint} showDexScreener />
                                </>
                              ) : (
                                <strong className="font-semibold text-[#f4ede2]">
                                  <AddressLink address={r.mint} showDexScreener />
                                </strong>
                              )}
                              {r.gem && <Badge tone="good">Early gem</Badge>}
                              <OppRiskChips opportunity={r.opportunity} risk={r.risk} />
                            </div>
                          </td>
                          <td className="py-3 px-3 align-middle text-[#f4ede2]/90 whitespace-nowrap">
                            {r.theme || (
                              <span className="text-[#cfc3b4]">no theme</span>
                            )}
                          </td>
                          <td className="py-3 px-3 align-middle text-right text-base font-semibold text-[#f4ede2] tabular-nums whitespace-nowrap">
                            {r.score}
                          </td>
                          <td
                            className={`py-3 px-3 align-middle font-medium whitespace-nowrap ${TONE_TEXT[bi.cls]}`}
                          >
                            {bi.label}
                          </td>
                          <td className="py-3 px-3 align-middle text-right text-[#f4ede2]/90 tabular-nums whitespace-nowrap">
                            {mcap}
                          </td>
                          <td className="py-3 pl-6 pr-3 align-middle text-xs text-[#cfc3b4] max-w-[240px]">
                            {missingList(r.unknowns)}
                          </td>
                          <td className="py-3 pl-3 align-middle text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2">
                              <motion.button
                                type="button"
                                aria-expanded={isOpen}
                                whileTap={BUTTON_TAP}
                                onClick={() => toggleMint(r.mint)}
                                className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 min-w-[124px] min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                                  isOpen
                                    ? 'bg-[#e59a28] text-[#110e0b]'
                                    : 'border border-[#2d251d] bg-[#211c16] text-[#f4ede2] hover:border-[#e59a28]/50'
                                }`}
                              >
                                {isOpen ? (
                                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                {isOpen ? 'Hide' : 'Explain score'}
                              </motion.button>
                              <WatchButton
                                mint={r.mint}
                                watched={watchedSet.has(r.mint)}
                                onToggle={onToggleWatch}
                              />
                            </div>
                          </td>
                        </motion.tr>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <tr key={`${r.mint}-breakdown`}>
                              <td colSpan={7} className="p-0">
                                <motion.div
                                  variants={expandCollapseVariants}
                                  initial="initial"
                                  animate="animate"
                                  exit="exit"
                                  className="overflow-hidden"
                                >
                                  <div className="pb-4 pt-1">
                                    {renderBreakdown(r)}
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        </Card>
      </motion.div>

      <motion.div variants={staggerItemVariants}>
        <Card
          title="Themes this hour"
          subtitle="A narrative is a word that at least one coin has in its name or symbol and three or more trending coins share. Related words are merged. Clones and one-coin narratives are tagged and give no score points. Share is how much of the last hour's trading went to its coins."
          className={highlightClass}
        >
          {themes.length === 0 ? (
            <p className="text-sm text-[#cfc3b4]">No themes yet.</p>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                      <th className="py-2.5 pr-4 text-left">Narrative</th>
                      <th className="py-2.5 px-3 text-right">Coins</th>
                      <th className="py-2.5 px-3 text-right">Traded, 1 h</th>
                      <th className="py-2.5 px-3 text-right">Share</th>
                      <th className="py-2.5 px-3 text-right">Change</th>
                      <th className="py-2.5 pl-3 text-right">Leader</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2d251d]/70">
                    {visibleThemes.map((t) => {
                      const sharePct = Math.min(100, Math.max(0, t.share * 100));
                      const open = openThemes.has(t.keyword);
                      const toggle = () =>
                        setOpenThemes((s) => {
                          const n = new Set(s);
                          if (!n.delete(t.keyword)) n.add(t.keyword);
                          return n;
                        });
                      const delta = t.prevShare == null ? null : (t.share - t.prevShare) * 100;
                      const scoreOf = new Map(data.running.map((r) => [r.mint, r.score]));
                      return (
                        <Fragment key={t.keyword}>
                          <tr
                            tabIndex={0}
                            aria-expanded={open}
                            onClick={toggle}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggle();
                              }
                            }}
                            className="cursor-pointer hover:bg-[#211c16]/40 transition-colors"
                          >
                            <td className="py-2.5 pr-4 font-medium text-[#f4ede2]">
                              {t.keyword}
                              {t.aliases.length > 0 && (
                                <span className="ml-2 text-xs font-normal text-[#cfc3b4]">
                                  {t.aliases.join(', ')}
                                </span>
                              )}
                              {t.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="ml-2 rounded-full border border-[#2d251d] bg-[#211c16] px-2 py-0.5 text-[10px] font-medium text-[#cfc3b4]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-[#f4ede2]/90">
                              {t.tokens}
                              {t.newCoins > 0 && (
                                <span className="ml-1.5 text-xs text-[#e59a28]">+{t.newCoins} new</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-[#f4ede2]/90">
                              ${fmt(t.volume)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center justify-end gap-2.5">
                                <div className="hidden sm:block h-1.5 w-20 overflow-hidden rounded-full bg-[#110e0b]">
                                  <div
                                    className="h-full rounded-full bg-[#e59a28]"
                                    style={{ width: `${sharePct}%` }}
                                  />
                                </div>
                                <span className="tabular-nums text-sm text-[#f4ede2]/90 w-12 text-right">
                                  {fmt(t.share * 100, 1)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-[#f4ede2]/90">
                              {delta == null ? '–' : `${delta >= 0 ? '↑' : '↓'} ${fmt(Math.abs(delta), 1)} pp`}
                            </td>
                            <td className="py-2.5 pl-3 text-right text-[#f4ede2]/90">
                              {t.leader.symbol ?? '—'}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={6} className="pb-3 pt-1">
                                <ul className="space-y-1.5 text-xs text-[#cfc3b4]">
                                  {t.members.map((m) => (
                                    <li key={m.mint} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="font-medium text-[#f4ede2]">{m.symbol ?? '—'}</span>
                                      <AddressLink address={m.mint} />
                                      <span className="tabular-nums">${fmt(m.vol_h1)}</span>
                                      <span className="tabular-nums">
                                        {m.created_at == null ? '—' : `${fmt((Date.now() / 1000 - m.created_at) / 3600, 1)} h old`}
                                      </span>
                                      {scoreOf.has(m.mint) && (
                                        <span className="tabular-nums">score {fmt(scoreOf.get(m.mint)!)}</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            {themes.length > 5 && (
              <motion.button
                type="button"
                whileTap={BUTTON_TAP}
                onClick={() => setShowAllThemes((s) => !s)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border border-[#2d251d] bg-[#211c16] px-3.5 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#e59a28]/50 transition-colors cursor-pointer"
              >
                {showAllThemes ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {showAllThemes
                  ? 'Show top 5'
                  : `Show all ${themes.length} themes`}
              </motion.button>
            )}
          </div>
        )}
        </Card>
      </motion.div>

      <motion.div variants={staggerItemVariants}>
        <Card
          title="Best calls: wallet scorecard"
          subtitle="How tracked wallets have performed on their recorded trades."
          className={highlightClass}
        >
          {data.wallets.length === 0 ? (
            <p className="text-sm text-[#cfc3b4]">
              No wallets tracked. Add some to wallets.txt.
            </p>
          ) : (
            <div>
              <div className="sm:hidden space-y-2.5">
                {data.wallets.map((w, idx) => (
                  <motion.div
                    key={`m-${w.address}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...FAST_EASE_OUT,
                      delay: boundedStaggerDelay(idx),
                    }}
                    className="rounded-lg border border-[#2d251d] bg-[#211c16]/70 p-3 space-y-2"
                  >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <WalletDisplay address={w.address} label={w.label} />
                    <span className="text-xs text-[#cfc3b4]">{w.class}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Bought</dt>
                      <dd className="text-sm text-[#f4ede2]/90">{w.bought}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Win rate</dt>
                      <dd className="text-sm text-[#f4ede2]/90">
                        {w.winRate === null ? (
                          <span className="text-[#cfc3b4]">—</span>
                        ) : (
                          `${fmt(w.winRate * 100)}%`
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Median hold (s)</dt>
                      <dd className="text-sm text-[#f4ede2]/90">
                        {w.medianHoldSeconds === null ||
                        w.medianHoldSeconds === undefined ? (
                          <span className="text-[#cfc3b4]">—</span>
                        ) : (
                          fmt(w.medianHoldSeconds)
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Still holding</dt>
                      <dd className="text-sm text-[#f4ede2]/90">
                        {w.stillHoldingShare === null ? (
                          <span className="text-[#cfc3b4]">—</span>
                        ) : (
                          `${fmt(w.stillHoldingShare * 100)}%`
                        )}
                      </dd>
                    </div>
                  </dl>
                </motion.div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                    <th className="py-2.5 pr-4 text-left">Wallet</th>
                    <th className="py-2.5 px-3 text-left">Class</th>
                    <th className="py-2.5 px-3 text-right">Bought</th>
                    <th className="py-2.5 px-3 text-right">Win rate</th>
                    <th className="py-2.5 px-3 text-right">Median hold (s)</th>
                    <th className="py-2.5 pl-3 text-right">Still holding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d251d]/70">
                  {data.wallets.map((w, idx) => (
                    <motion.tr
                      key={w.address}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        ...FAST_EASE_OUT,
                        delay: boundedStaggerDelay(idx),
                      }}
                      className="hover:bg-[#211c16]/40 transition-colors"
                    >
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <WalletDisplay address={w.address} label={w.label} />
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#f4ede2]/90 whitespace-nowrap">
                        {w.class}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm text-[#f4ede2]/90 whitespace-nowrap">
                        {w.bought}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm whitespace-nowrap">
                        {w.winRate === null ? (
                          <span className="text-[#cfc3b4]">—</span>
                        ) : (
                          <span className="text-[#f4ede2]/90">
                            {fmt(w.winRate * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm whitespace-nowrap">
                        {w.medianHoldSeconds === null ||
                        w.medianHoldSeconds === undefined ? (
                          <span className="text-[#cfc3b4]">—</span>
                        ) : (
                          <span className="text-[#f4ede2]/90">
                            {fmt(w.medianHoldSeconds)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-sm whitespace-nowrap">
                        {w.stillHoldingShare === null ? (
                          <span className="text-[#cfc3b4]">—</span>
                        ) : (
                          <span className="text-[#f4ede2]/90">
                            {fmt(w.stillHoldingShare * 100)}%
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.wallets.some(
              (w) =>
                w.winRate === null ||
                w.medianHoldSeconds === null ||
                w.medianHoldSeconds === undefined ||
                w.stillHoldingShare === null,
            ) && (
              <p className="mt-2.5 text-xs text-[#cfc3b4]">
                — means not enough trades yet.
              </p>
            )}
          </div>
        )}
        </Card>
      </motion.div>

      <motion.div variants={staggerItemVariants}>
        <Card
          title="Calibration: later price by score band"
          subtitle="Checks each coin's price 1, 6 and 24 hours after scoring."
          className={highlightClass}
        >
          {data.calibration.rows.length === 0 ? (
            <p className="text-sm text-[#cfc3b4]">{calEmpty}</p>
          ) : (
            <>
              <div className="sm:hidden space-y-2.5">
                {data.calibration.rows.map((r, idx) => (
                  <motion.div
                    key={`m-${r.band}-${r.horizon_h}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...FAST_EASE_OUT,
                      delay: boundedStaggerDelay(idx),
                    }}
                    className="rounded-lg border border-[#2d251d] bg-[#211c16]/70 p-3 space-y-2"
                  >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-[#f4ede2]">
                      {bandInfo(r.band).label}
                    </span>
                    <span className="text-xs text-[#cfc3b4] tabular-nums">
                      {r.horizon_h} h
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 tabular-nums">
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Count</dt>
                      <dd className="text-sm text-[#f4ede2]/90">{r.count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Mean change</dt>
                      <dd
                        className={`text-sm font-medium ${
                          r.meanChangePct > 0
                            ? 'text-[#5cd093]'
                            : r.meanChangePct < 0
                              ? 'text-[#fb7185]'
                              : 'text-[#f4ede2]/90'
                        }`}
                      >
                        {fmt(r.meanChangePct, 1)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Share up</dt>
                      <dd className="text-sm text-[#f4ede2]/90">
                        {fmt(r.positiveShare * 100)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Hit +20%</dt>
                      <dd className="text-sm text-[#f4ede2]/90">{hit(r.hitUp20, r.pathCount)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#cfc3b4]">Hit -30%</dt>
                      <dd className="text-sm text-[#f4ede2]/90">{hit(r.hitDown30, r.pathCount)}</dd>
                    </div>
                  </dl>
                </motion.div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                    <th className="py-2.5 pr-4 text-left">Band</th>
                    <th className="py-2.5 px-3 text-right">Horizon</th>
                    <th className="py-2.5 px-3 text-right">Count</th>
                    <th className="py-2.5 px-3 text-right">Mean change</th>
                    <th className="py-2.5 px-3 text-right">Share up</th>
                    <th className="py-2.5 px-3 text-right">Hit +20%</th>
                    <th className="py-2.5 pl-3 text-right">Hit -30%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d251d]/70">
                  {data.calibration.rows.map((r, idx) => (
                    <motion.tr
                      key={`${r.band}-${r.horizon_h}-${idx}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        ...FAST_EASE_OUT,
                        delay: boundedStaggerDelay(idx),
                      }}
                      className="hover:bg-[#211c16]/40 transition-colors"
                    >
                      <td className="py-2.5 pr-4 font-medium text-[#f4ede2] whitespace-nowrap">
                        {bandInfo(r.band).label}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs text-[#cfc3b4] whitespace-nowrap">
                        {r.horizon_h} h
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm text-[#f4ede2]/90 whitespace-nowrap">
                        {r.count}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums text-sm font-medium whitespace-nowrap ${
                          r.meanChangePct > 0
                            ? 'text-[#5cd093]'
                            : r.meanChangePct < 0
                              ? 'text-[#fb7185]'
                              : 'text-[#f4ede2]/90'
                        }`}
                      >
                        {fmt(r.meanChangePct, 1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm text-[#f4ede2]/90 whitespace-nowrap">
                        {fmt(r.positiveShare * 100)}%
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sm text-[#f4ede2]/90 whitespace-nowrap">
                        {hit(r.hitUp20, r.pathCount)}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-sm text-[#f4ede2]/90 whitespace-nowrap">
                        {hit(r.hitDown30, r.pathCount)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!data.calibration.thinPath && (
              <p className="mt-3 text-xs text-[#cfc3b4]">
                Thin path: {data.calibration.thinPath} rows
              </p>
            )}
          </>
        )}
        </Card>
      </motion.div>

      {partRows.length > 0 && (
        <motion.div variants={staggerItemVariants}>
          <Card
            title="By score part (1h)"
            subtitle="Each part split into thirds (low, mid, high): rows, share that rose 20%, share that fell 30%."
            className={highlightClass}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                    <th className="py-2.5 pr-4 text-left">Part</th>
                    {THIRDS.map((t) => (
                      <th key={t} className="py-2.5 px-3 text-right">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d251d]/70">
                  {partRows.map(([part, thirds]) => (
                    <tr key={part}>
                      <td className="py-2.5 pr-4 font-medium text-[#f4ede2] whitespace-nowrap">
                        {PARTS[part]?.name ?? EXTRA_PARTS[part] ?? part}
                      </td>
                      {[0, 1, 2].map((i) => {
                        const c = thirds[i];
                        return (
                          <td
                            key={i}
                            className="py-2.5 px-3 text-right tabular-nums text-xs text-[#f4ede2]/90 whitespace-nowrap"
                          >
                            {c
                              ? `${c.count} / +20% ${hit(c.hitUp20, c.count)} / -30% ${hit(c.hitDown30, c.count)}`
                              : '–'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
