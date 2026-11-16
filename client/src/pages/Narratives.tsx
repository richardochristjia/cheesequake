import { useEffect, useState } from 'react';
import {
  AddressLink,
  Badge,
  Card,
  TONE_TEXT,
  WalletDisplay,
  WatchButton,
} from '../components/ui';
import { fmt } from '../lib/format';
import { PARTS, bandInfo, explainPart, missingList } from '../lib/glossary';
import type { NarrativesResponse } from '../types';

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
  const [openMints, setOpenMints] = useState<Set<string>>(() => new Set());
  const [showAllThemes, setShowAllThemes] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/narratives')
      .then((r) => r.json() as Promise<NarrativesResponse>)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refreshTick]);

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
        <p className="text-sm text-[#9c8f80]">Loading…</p>
      </Card>
    );
  }

  const themes = data.themes || [];
  const visibleThemes = showAllThemes ? themes : themes.slice(0, 5);
  const calEmpty = `No results yet. The tool checks each coin's price 1, 6 and 24 hours later.${
    data.calibration.missed ? ` Missed: ${data.calibration.missed}.` : ''
  }`;

  return (
    <div className="space-y-4">
      <Card
        title="Running now"
        subtitle="Coins that passed every safety check in the last 30 minutes, best score first. The score is out of 100 and counts good signs. It is not a prediction."
      >
        {data.running.length === 0 ? (
          <p className="text-sm text-[#9c8f80]">
            Nothing has passed every safety check in the last 30 minutes.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_64px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_auto] gap-3 pb-2 border-b border-[#2d251d] text-xs font-medium text-[#9c8f80]">
              <span>Coin</span>
              <span>Theme</span>
              <span>Score</span>
              <span>Reading</span>
              <span>Market cap</span>
              <span>Missing data</span>
              <span></span>
            </div>

            {data.running.map((r) => {
              const isOpen = openMints.has(r.mint);
              const bi = bandInfo(r.band);
              const mcap =
                r.mcap_usd === null || r.mcap_usd === undefined
                  ? 'unknown'
                  : `$${fmt(r.mcap_usd)}`;
              const byPart = new Map((r.reasons || []).map((x) => [x.part, x]));

              return (
                <div
                  key={r.mint}
                  className="border-b border-[#2d251d]/70 pb-3 pt-1"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_64px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_auto] gap-3 items-center py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.symbol ? (
                        <>
                          <strong className="text-sm font-semibold text-[#f4ede2] truncate">
                            {r.symbol}
                          </strong>
                          <AddressLink address={r.mint} />
                        </>
                      ) : (
                        <strong className="text-sm font-semibold text-[#f4ede2]">
                          <AddressLink address={r.mint} />
                        </strong>
                      )}
                    </div>

                    <div className="text-sm text-[#f4ede2]/90">
                      <span className="md:hidden text-xs text-[#9c8f80] mr-1.5">
                        Theme:
                      </span>
                      {r.theme || 'no theme'}
                    </div>

                    <div className="text-lg font-semibold text-[#f4ede2] tabular-nums">
                      <span className="md:hidden text-xs font-normal text-[#9c8f80] mr-1.5">
                        Score:
                      </span>
                      {r.score}
                    </div>

                    <div className={`text-sm font-medium ${TONE_TEXT[bi.cls]}`}>
                      <span className="md:hidden text-xs text-[#9c8f80] mr-1.5">
                        Reading:
                      </span>
                      {bi.label}
                    </div>

                    <div className="text-sm text-[#f4ede2]/90 tabular-nums">
                      <span className="md:hidden text-xs text-[#9c8f80] mr-1.5">
                        Market cap:
                      </span>
                      {mcap}
                    </div>

                    <div className="text-xs text-[#9c8f80] break-words">
                      <span className="md:hidden mr-1.5">Missing data:</span>
                      {missingList(r.unknowns)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggleMint(r.mint)}
                        className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          isOpen
                            ? 'bg-[#e59a28] text-[#110e0b]'
                            : 'border border-[#2d251d] bg-[#211c16] text-[#f4ede2] hover:border-[#e59a28]/50'
                        }`}
                      >
                        {isOpen ? 'Hide' : 'Explain score'}
                      </button>
                      <WatchButton
                        mint={r.mint}
                        watched={watchedSet.has(r.mint)}
                        onToggle={onToggleWatch}
                      />
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-2 rounded-lg border border-[#2d251d] bg-[#211c16]/70 p-4">
                      <ul className="divide-y divide-[#2d251d]/70">
                        {Object.keys(PARTS).map((k) => {
                          const p = explainPart(
                            k,
                            byPart.get(k),
                            r.unknowns,
                            r.theme,
                          );
                          const pct =
                            p.max > 0
                              ? Math.min(100, Math.round((p.points / p.max) * 100))
                              : 0;
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
                                <p className="text-xs text-[#9c8f80] mt-0.5">
                                  {p.text}
                                </p>
                                <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[#110e0b]">
                                  <div
                                    className="h-full rounded-full bg-[#e59a28]"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs text-[#9c8f80] whitespace-nowrap tabular-nums">
                                {p.points} of {p.max}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-3 text-xs text-[#9c8f80]">
                        Missing data counts as 0 points and caps the score at
                        79.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Themes this hour"
        subtitle="A theme is a word that three or more trending coins share in their name or description. Share is how much of the last hour's trading went to coins with that word."
      >
        {themes.length === 0 ? (
          <p className="text-sm text-[#9c8f80]">No themes yet.</p>
        ) : (
          <div>
            <div className="grid grid-cols-[minmax(0,1.2fr)_64px_minmax(0,1fr)_minmax(0,1fr)] gap-3 pb-2 border-b border-[#2d251d] text-xs font-medium text-[#9c8f80]">
              <span>Word</span>
              <span>Coins</span>
              <span>Traded, 1 h</span>
              <span>Share</span>
            </div>
            <div className="divide-y divide-[#2d251d]/70">
              {visibleThemes.map((t) => {
                const sharePct = Math.min(100, Math.max(0, t.share * 100));
                return (
                  <div
                    key={t.keyword}
                    className="grid grid-cols-[minmax(0,1.2fr)_64px_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center py-2.5 text-sm"
                  >
                    <span className="font-medium text-[#f4ede2] truncate">
                      {t.keyword}
                    </span>
                    <span className="tabular-nums text-[#f4ede2]/90">
                      {t.tokens}
                    </span>
                    <span className="tabular-nums text-[#f4ede2]/90">
                      ${fmt(t.volume)}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:block h-1.5 w-16 overflow-hidden rounded-full bg-[#110e0b]">
                        <div
                          className="h-full rounded-full bg-[#e59a28]"
                          style={{ width: `${sharePct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-[#9c8f80]">
                        {fmt(t.share * 100, 1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {themes.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllThemes((s) => !s)}
                className="mt-3 min-h-[36px] rounded-lg border border-[#2d251d] bg-[#211c16] px-3 py-1.5 text-xs font-medium text-[#f4ede2] hover:border-[#e59a28]/50 transition-colors cursor-pointer"
              >
                {showAllThemes
                  ? 'Show top 5'
                  : `Show all ${themes.length} themes`}
              </button>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Best calls: wallet scorecard"
        subtitle="How tracked wallets have performed on their recorded trades."
      >
        {data.wallets.length === 0 ? (
          <p className="text-sm text-[#9c8f80]">
            No wallets tracked. Add some to wallets.txt.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2d251d] text-left text-xs font-medium text-[#9c8f80]">
                  <th className="py-2 pr-3">Wallet</th>
                  <th className="py-2 pr-3">Class</th>
                  <th className="py-2 pr-3">Bought</th>
                  <th className="py-2 pr-3">Win rate</th>
                  <th className="py-2 pr-3">Median hold (s)</th>
                  <th className="py-2">Still holding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d251d]/70">
                {data.wallets.map((w) => (
                  <tr key={w.address}>
                    <td className="py-2 pr-3">
                      <WalletDisplay address={w.address} label={w.label} />
                    </td>
                    <td className="py-2 pr-3 text-xs text-[#f4ede2]/90">
                      {w.class}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-[#f4ede2]/90">
                      {w.bought}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-[#f4ede2]/90">
                      {w.winRate === null
                        ? 'not enough trades yet'
                        : `${fmt(w.winRate * 100)}%`}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-[#f4ede2]/90">
                      {w.medianHoldSeconds === null ||
                      w.medianHoldSeconds === undefined
                        ? 'not enough trades yet'
                        : fmt(w.medianHoldSeconds)}
                    </td>
                    <td className="py-2 tabular-nums text-xs text-[#f4ede2]/90">
                      {w.stillHoldingShare === null
                        ? 'not enough trades yet'
                        : `${fmt(w.stillHoldingShare * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Calibration: later price by score band"
        subtitle="Checks each coin's price 1, 6 and 24 hours after scoring."
      >
        {data.calibration.rows.length === 0 ? (
          <p className="text-sm text-[#9c8f80]">{calEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2d251d] text-left text-xs font-medium text-[#9c8f80]">
                  <th className="py-2 pr-3">Band</th>
                  <th className="py-2 pr-3">Horizon</th>
                  <th className="py-2 pr-3">Count</th>
                  <th className="py-2 pr-3">Mean change</th>
                  <th className="py-2">Share up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d251d]/70">
                {data.calibration.rows.map((r, idx) => (
                  <tr key={`${r.band}-${r.horizon_h}-${idx}`}>
                    <td className="py-2 pr-3 font-medium text-[#f4ede2]">
                      {bandInfo(r.band).label}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-[#9c8f80]">
                      {r.horizon_h} h
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-[#f4ede2]/90">
                      {r.count}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-[#f4ede2]/90">
                      {fmt(r.meanChangePct, 1)}%
                    </td>
                    <td className="py-2 tabular-nums text-xs text-[#f4ede2]/90">
                      {fmt(r.positiveShare * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
