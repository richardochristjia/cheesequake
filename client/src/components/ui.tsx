import { useEffect, useState, type ReactNode } from 'react';
import { B58, short, type Tone } from '../lib/format';
import type { AlertItem } from '../types';

const TONE_CLASSES: Record<Tone, string> = {
  good: 'text-[#5cd093] border-[#5cd093]/40 bg-[#14100d]/85',
  mid: 'text-[#f59e0b] border-[#f59e0b]/40 bg-[#14100d]/85',
  low: 'text-[#f59e0b] border-[#f59e0b]/40 bg-[#14100d]/85',
  bad: 'text-[#fb7185] border-[#fb7185]/40 bg-[#14100d]/85',
  mut: 'text-[#cfc3b4] border-[#f4ede2]/15 bg-[#14100d]/85',
};

export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-[#5cd093]',
  mid: 'text-[#f59e0b]',
  low: 'text-[#f59e0b]',
  bad: 'text-[#fb7185]',
  mut: 'text-[#cfc3b4]',
};

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`glass-card rounded-xl p-4 sm:p-5 ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && (
              <h2 className="text-lg font-semibold tracking-tight text-[#f4ede2]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-[#cfc3b4] max-w-prose">
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  tone = 'mut',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-normal sm:whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function AddressLink({
  address,
  className = '',
}: {
  address: string | null | undefined;
  className?: string;
}) {
  if (!address) return null;
  if (!B58.test(address)) {
    return <span className={`font-mono text-xs ${className}`}>{short(address)}</span>;
  }
  return (
    <a
      href={`https://solscan.io/account/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono text-xs text-[#e59a28] hover:text-[#f4ede2] underline decoration-[#e59a28]/40 underline-offset-2 transition-colors ${className}`}
    >
      {short(address)}
    </a>
  );
}

export function WalletDisplay({
  address,
  label,
}: {
  address: string | null | undefined;
  label?: string | null;
}) {
  if (!address) return null;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {label && <span className="font-medium text-[#f4ede2]">{label} </span>}
      <AddressLink address={address} />
    </span>
  );
}

export function AlertWalletDisplay({ alert }: { alert: AlertItem }) {
  if (alert.wallet) {
    return <WalletDisplay address={alert.wallet} label={alert.wallet_label} />;
  }
  if (alert.kind === 'consensus') {
    const wallets = Array.isArray(alert.detail?.wallets)
      ? alert.detail.wallets
      : [];
    const labels = alert.detail?.wallet_labels || {};
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {wallets.map((w, i) => (
          <span key={w} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-[#cfc3b4]">, </span>}
            <WalletDisplay
              address={w}
              label={Object.hasOwn(labels, w) ? labels[w] : null}
            />
          </span>
        ))}
      </span>
    );
  }
  return null;
}

export function TokenAvatar({
  imageUrl,
  symbol,
  mint,
  size = 'md',
}: {
  imageUrl?: string | null;
  symbol?: string | null;
  mint: string;
  size?: 'sm' | 'md';
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  const dims = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs';
  const monogram =
    (symbol || mint)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || '?';

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={symbol || short(mint)}
        onError={() => setImgError(true)}
        className={`${dims} shrink-0 rounded-full border border-[#2d251d] bg-[#211c16] object-cover`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full border border-[#2d251d] bg-[#211c16] font-semibold text-[#e59a28]`}
    >
      {monogram}
    </div>
  );
}

export function WatchButton({
  mint,
  watched,
  onToggle,
}: {
  mint: string;
  watched: boolean;
  onToggle: (mint: string) => void;
}) {
  if (!B58.test(mint || '')) return null;
  return (
    <button
      type="button"
      aria-pressed={watched}
      onClick={() => onToggle(mint)}
      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
        watched
          ? 'bg-[#e59a28] text-[#110e0b] hover:bg-[#e59a28]/90'
          : 'border border-[#2d251d] bg-[#211c16] text-[#f4ede2] hover:border-[#e59a28]/50'
      }`}
    >
      {watched ? 'Watching' : 'Watch'}
    </button>
  );
}
