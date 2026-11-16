import { useEffect, useState } from 'react';
import {
  AddressLink,
  AlertWalletDisplay,
  Card,
  WatchButton,
} from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { KindTooltip } from '../components/KindTooltip';
import { formatAlertDetail, short, when } from '../lib/format';
import type { PingResponse } from '../types';

const KINDS = [
  { value: '', label: 'all' },
  { value: 'buy', label: 'buy' },
  { value: 'sell', label: 'sell' },
  { value: 'consensus', label: 'consensus' },
  { value: 'exit', label: 'exit' },
];

export function Ping({
  refreshTick,
  watchedSet,
  onToggleWatch,
}: {
  refreshTick: number;
  watchedSet: Set<string>;
  onToggleWatch: (mint: string) => void;
}) {
  const [kind, setKind] = useState('');
  const [wallet, setWallet] = useState('');
  const [data, setData] = useState<PingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (wallet) params.set('wallet', wallet);
    const qs = params.toString();
    fetch(`/api/ping${qs ? `?${qs}` : ''}`)
      .then((r) => r.json() as Promise<PingResponse>)
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
  }, [kind, wallet, refreshTick]);

  return (
    <Card title="Wallet activity">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#cfc3b4]">
          Alert kind
          <select
            aria-label="Alert kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="glass-input glass-select min-h-[44px] rounded-lg px-3 py-2 text-sm font-normal text-[#f4ede2]"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-[#cfc3b4]">
          Wallet
          <select
            aria-label="Wallet"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            className="glass-input glass-select min-h-[44px] rounded-lg px-3 py-2 text-sm font-normal text-[#f4ede2]"
          >
            <option value="">all wallets</option>
            {(data?.wallets || []).map((w) => (
              <option key={w.address} value={w.address}>
                {w.label ? `${w.label} (${short(w.address)})` : short(w.address)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="text-sm text-[#fb7185]">Could not load: {error}</p>
      )}

      {!error && !data && (
        <p className="text-sm text-[#cfc3b4]">Loading…</p>
      )}

      {!error && data && data.alerts.length === 0 && (
        <EmptyState
          title="No alerts yet"
          description="Tracked wallet buys, sells, consensus entries, and exit warnings will appear here."
        />
      )}

      {!error && data && data.alerts.length > 0 && (
        <>
          <div className="sm:hidden space-y-2.5">
            {data.alerts.map((a, idx) => (
              <div
                key={`m-${a.ts}-${a.kind}-${a.mint}-${idx}`}
                className="rounded-lg border border-[#2d251d] bg-[#211c16]/70 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      {a.symbol && (
                        <span className="font-semibold text-[#f4ede2]">
                          {a.symbol}
                        </span>
                      )}
                      <AddressLink address={a.mint} />
                    </div>
                    <KindTooltip kind={a.kind} />
                  </div>
                  <WatchButton
                    mint={a.mint}
                    watched={watchedSet.has(a.mint)}
                    onToggle={onToggleWatch}
                  />
                </div>
                <p className="text-sm text-[#f4ede2]/90 tabular-nums">
                  {formatAlertDetail(a)}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#cfc3b4]">
                  <AlertWalletDisplay alert={a} />
                  <span className="tabular-nums">{when(a.ts)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2d251d] text-left text-xs font-medium text-[#cfc3b4]">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Kind</th>
                  <th className="py-2 pr-3">Coin</th>
                  <th className="py-2 pr-3">Wallet</th>
                  <th className="py-2 pr-3">Detail</th>
                  <th className="py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d251d]/70">
                {data.alerts.map((a, idx) => (
                  <tr key={`${a.ts}-${a.kind}-${a.mint}-${idx}`}>
                    <td className="py-2.5 pr-3 text-xs text-[#cfc3b4] whitespace-nowrap tabular-nums">
                      {when(a.ts)}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <KindTooltip kind={a.kind} />
                    </td>
                    <td className="py-2.5 pr-3 text-sm whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {a.symbol && (
                          <span className="font-medium text-[#f4ede2]">
                            {a.symbol}
                          </span>
                        )}
                        <AddressLink address={a.mint} />
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      <AlertWalletDisplay alert={a} />
                    </td>
                    <td className="py-2.5 pr-3 text-sm text-[#f4ede2]/90 tabular-nums">
                      {formatAlertDetail(a)}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <WatchButton
                        mint={a.mint}
                        watched={watchedSet.has(a.mint)}
                        onToggle={onToggleWatch}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
