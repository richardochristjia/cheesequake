import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { KIND_INFO } from '../lib/glossary';
import { tooltipVariants } from '../lib/motion';

function humanizeKind(raw: string): string {
  if (!raw) return '';
  const spaced = raw.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function KindTooltip({ kind }: { kind: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const raw = kind == null ? '' : String(kind);
  const display = humanizeKind(raw);
  const desc = Object.hasOwn(KIND_INFO, raw) ? KIND_INFO[raw] : null;
  if (!desc) return <span>{display}</span>;

  return (
    <span
      className="info-tip group relative inline-flex items-center gap-1"
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
    >
      <span className="text-xs font-medium text-[#f4ede2]">{display}</span>
      <button
        type="button"
        aria-label={`What ${display} means`}
        aria-describedby={open ? tooltipId : undefined}
        className="info-btn inline-flex items-center justify-center rounded p-0.5 text-[#cfc3b4] hover:text-[#e59a28] focus-visible:text-[#e59a28] cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={tooltipId}
            role="tooltip"
            variants={tooltipVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="tip-box block absolute left-0 top-full mt-1.5 z-30 w-64 max-w-[75vw] rounded-lg border border-[#2d251d] bg-[#211c16] px-3 py-2 text-xs font-normal leading-relaxed text-[#f4ede2] shadow-xl whitespace-normal text-left pointer-events-none"
          >
            {desc}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
