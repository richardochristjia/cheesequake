import { X } from 'lucide-react';
import { fmt, short, type Tone } from '../lib/format';
import { bandInfo } from '../lib/glossary';
import type { AlertItem, RunningCoin } from '../types';

export type PingToast =
  | {
      id: string;
      kind: 'ping';
      alert: AlertItem;
    }
  | {
      id: string;
      kind: 'narrative';
      coin: RunningCoin;
    };

function humanizeKind(raw: string): string {
  if (!raw) return '';
  const spaced = raw.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function kindTone(kind: string): string {
  if (kind === 'buy') return 'text-[#5cd093] border-[#5cd093]/35 bg-[#5cd093]/10';
  if (kind.startsWith('exit') || kind === 'sell') {
    return 'text-[#fb7185] border-[#fb7185]/35 bg-[#fb7185]/10';
  }
  return 'text-[#e59a28] border-[#e59a28]/35 bg-[#e59a28]/10';
}

const NARRATIVE_TONE_CLASSES: Record<Tone, string> = {
  good: 'text-[#5cd093] border-[#5cd093]/35 bg-[#5cd093]/10',
  mid: 'text-[#e59a28] border-[#e59a28]/35 bg-[#e59a28]/10',
  low: 'text-[#e59a28] border-[#e59a28]/35 bg-[#e59a28]/10',
  bad: 'text-[#fb7185] border-[#fb7185]/35 bg-[#fb7185]/10',
  mut: 'text-[#cfc3b4] border-[#f4ede2]/15 bg-[#f4ede2]/5',
};

function ToastBody({ toast }: { toast: PingToast }) {
  if (toast.kind === 'narrative') {
    const { coin } = toast;
    const bi = bandInfo(coin.band);
    const tokenLabel = coin.symbol || short(coin.mint);
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${NARRATIVE_TONE_CLASSES[bi.cls]}`}
          >
            {bi.label}
          </span>
          <span className="truncate text-sm font-semibold text-[#f4ede2]">
            {tokenLabel}
          </span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-[#e59a28]">
            {`${coin.score}/100`}
          </span>
        </div>
        {coin.theme && (
          <p className="mt-1 truncate text-xs text-[#cfc3b4]">{coin.theme}</p>
        )}
      </>
    );
  }

  const { alert } = toast;
  const kindLabel = humanizeKind(alert.kind);
  const tokenLabel = alert.symbol || short(alert.mint);
  const walletLabel =
    alert.wallet_label || (alert.wallet ? short(alert.wallet) : null);
  const usdLabel = `$${fmt(alert.detail?.usd)}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${kindTone(alert.kind)}`}
        >
          {kindLabel}
        </span>
        <span className="truncate text-sm font-semibold text-[#f4ede2]">
          {tokenLabel}
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-[#e59a28]">
          {usdLabel}
        </span>
      </div>
      {walletLabel && (
        <p className="mt-1 truncate text-xs text-[#cfc3b4]">{walletLabel}</p>
      )}
    </>
  );
}

export function PingToaster({
  toasts,
  onDismiss,
  onOpenToast,
}: {
  toasts: PingToast[];
  onDismiss: (id: string) => void;
  onOpenToast: (toast: PingToast) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Ping notifications"
      className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto relative flex items-start gap-2 rounded-xl border border-[#e59a28]/35 bg-[#211c16]/95 p-3 text-[#f4ede2] shadow-[0_14px_36px_rgba(4,3,2,0.75)] backdrop-blur-md transition-colors hover:border-[#e59a28]/70"
        >
          <button
            type="button"
            onClick={() => onOpenToast(toast)}
            className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none"
          >
            <ToastBody toast={toast} />
          </button>

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded-md p-1 text-[#cfc3b4] hover:bg-[#2d251d] hover:text-[#f4ede2] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
