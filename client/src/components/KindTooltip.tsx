import { Info } from 'lucide-react';
import { KIND_INFO } from '../lib/glossary';

export function KindTooltip({ kind }: { kind: string | null | undefined }) {
  const label = kind == null ? '' : String(kind);
  const desc = Object.hasOwn(KIND_INFO, label) ? KIND_INFO[label] : null;
  if (!desc) return <span>{label}</span>;

  return (
    <span className="info-tip group relative inline-flex items-center gap-1">
      <span className="font-mono text-xs text-[#f4ede2]">{label}</span>
      <button
        type="button"
        aria-label={`What ${label} means`}
        className="info-btn inline-flex items-center justify-center rounded p-0.5 text-[#cfc3b4] hover:text-[#e59a28] focus-visible:text-[#e59a28] cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="tip-box hidden group-hover:block group-focus-within:block absolute left-0 top-full mt-1.5 z-30 w-64 max-w-[75vw] rounded-lg border border-[#2d251d] bg-[#211c16] px-3 py-2 text-xs font-normal leading-relaxed text-[#f4ede2] shadow-xl whitespace-normal text-left pointer-events-none"
      >
        {desc}
      </span>
    </span>
  );
}
