import { Fragment, useEffect, useState } from 'react';
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
        <p className="text-sm text-[#cfc3b4]">Loading…</p>
      </Card>
    );
  }

  const themes = data.themes || [];
  const visibleThemes = showAllThemes ? themes : themes.slice(0, 5);
  const calEmpty = `No results yet. The tool checks each coin's price 1, 6 and 24 hours later.${
    data.calibration.missed ? ` Missed: ${data.calibration.missed}.` : ''
  }`;

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
    <div className="space-y-4">
      <Card
        title="Running now"
        subtitle="Coins that passed every safety check in the last 30 minutes, best score first. The score is out of 100 and counts good signs. It is not a prediction."
      >
        {data.running.length === 0 ? (
          <p className="text-sm text-[#cfc3b4]">
            Nothing has passed every safety check in the last 30 minutes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                  <th className="py-2.5 pr-4 text-left">Coin</th>
                  <th className="py-2.5 px-3 text-left">Theme</th>
                  <th className="py-2.5 px-3 text-right">Score</th>
                  <th className="py-2.5 px-3 text-left">Reading</th>
                  <th className="py-2.5 px-3 text-right">Market cap</th>
                  <th className="py-2.5 px-3 text-left">Missing data</th>
                  <th className="py-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d251d]/70">
                {data.running.map((r) => {
                  const isOpen = openMints.has(r.mint);
                  const bi = bandInfo(r.band);
                  const mcap =
                    r.mcap_usd === null || r.mcap_usd === undefined
                      ? 'unknown'
                      : `$${fmt(r.mcap_usd)}`;
                  return (
                    <Fragment key={r.mint}>
                      <tr className="hover:bg-[#211c16]/40 transition-colors">
                        <td className="py-3 pr-4 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2 min-w-0">
                            {r.symbol ? (
                              <>
                                <strong className="font-semibold text-[#f4ede2]">
                                  {r.symbol}
                                </strong>
                                <AddressLink address={r.mint} />
                              </>
                            ) : (
                              <strong className="font-semibold text-[#f4ede2]">
                                <AddressLink address={r.mint} />
                              </strong>
                            )}
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
                        <td className="py-3 px-3 align-middle text-xs text-[#cfc3b4] max-w-[240px]">
                          {missingList(r.unknowns)}
                        </td>
                        <td className="py-3 pl-3 align-middle text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() => toggleMint(r.mint)}
                              className={`min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
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
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="pb-4 pt-1">
                            {renderBreakdown(r)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Themes this hour"
        subtitle="A theme is a word that three or more trending coins share in their name or description. Share is how much of the last hour's trading went to coins with that word."
      >
        {themes.length === 0 ? (
          <p className="text-sm text-[#cfc3b4]">No themes yet.</p>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                    <th className="py-2.5 pr-4 text-left">Word</th>
                    <th className="py-2.5 px-3 text-right w-24">Coins</th>
                    <th className="py-2.5 px-3 text-right">Traded, 1 h</th>
                    <th className="py-2.5 pl-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d251d]/70">
                  {visibleThemes.map((t) => {
                    const sharePct = Math.min(100, Math.max(0, t.share * 100));
                    return (
                      <tr
                        key={t.keyword}
                        className="hover:bg-[#211c16]/40 transition-colors"
                      >
                        <td className="py-2.5 pr-4 font-medium text-[#f4ede2]">
                          {t.keyword}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#f4ede2]/90">
                          {t.tokens}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-[#f4ede2]/90">
                          ${fmt(t.volume)}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <div className="inline-flex items-center justify-end gap-2.5">
                            <div className="hidden sm:block h-1.5 w-20 overflow-hidden rounded-full bg-[#110e0b]">
                              <div
                                className="h-full rounded-full bg-[#e59a28]"
                                style={{ width: `${sharePct}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-xs text-[#cfc3b4] w-12 text-right">
                              {fmt(t.share * 100, 1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {themes.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllThemes((s) => !s)}
                className="mt-3 min-h-[44px] rounded-lg border border-[#2d251d] bg-[#211c16] px-3.5 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#e59a28]/50 transition-colors cursor-pointer"
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
          <p className="text-sm text-[#cfc3b4]">
            No wallets tracked. Add some to wallets.txt.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                {data.wallets.map((w) => (
                  <tr
                    key={w.address}
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
                        <span className="text-xs italic text-[#cfc3b4]">
                          not enough trades yet
                        </span>
                      ) : (
                        <span className="text-[#f4ede2]/90">
                          {fmt(w.winRate * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-sm whitespace-nowrap">
                      {w.medianHoldSeconds === null ||
                      w.medianHoldSeconds === undefined ? (
                        <span className="text-xs italic text-[#cfc3b4]">
                          not enough trades yet
                        </span>
                      ) : (
                        <span className="text-[#f4ede2]/90">
                          {fmt(w.medianHoldSeconds)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums text-sm whitespace-nowrap">
                      {w.stillHoldingShare === null ? (
                        <span className="text-xs italic text-[#cfc3b4]">
                          not enough trades yet
                        </span>
                      ) : (
                        <span className="text-[#f4ede2]/90">
                          {fmt(w.stillHoldingShare * 100)}%
                        </span>
                      )}
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
          <p className="text-sm text-[#cfc3b4]">{calEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2d251d] text-xs font-medium text-[#cfc3b4]">
                  <th className="py-2.5 pr-4 text-left">Band</th>
                  <th className="py-2.5 px-3 text-right">Horizon</th>
                  <th className="py-2.5 px-3 text-right">Count</th>
                  <th className="py-2.5 px-3 text-right">Mean change</th>
                  <th className="py-2.5 pl-3 text-right">Share up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d251d]/70">
                {data.calibration.rows.map((r, idx) => (
                  <tr
                    key={`${r.band}-${r.horizon_h}-${idx}`}
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
                    <td className="py-2.5 pl-3 text-right tabular-nums text-sm text-[#f4ede2]/90 whitespace-nowrap">
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
