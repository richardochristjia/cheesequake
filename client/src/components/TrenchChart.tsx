import { useState, type MouseEvent } from 'react';
import type { MarketHourlyRow } from '../types';

const ZONES = [
  { min: 80, max: 100, label: 'Euphoria', fill: 'rgba(251, 113, 133, 0.08)' },
  { min: 60, max: 80, label: 'Hot', fill: 'rgba(229, 154, 40, 0.09)' },
  { min: 40, max: 60, label: 'Neutral', fill: 'rgba(244, 237, 226, 0.03)' },
  { min: 20, max: 40, label: 'Cool', fill: 'rgba(92, 208, 147, 0.04)' },
  { min: 0, max: 20, label: 'Cold', fill: 'rgba(156, 143, 128, 0.05)' },
];

const zoneName = (v: number) =>
  v < 20 ? 'Cold' : v < 40 ? 'Cool' : v < 60 ? 'Neutral' : v < 80 ? 'Hot' : 'Euphoria';

export function TrenchChart({
  hourly,
  indexValue,
  hours,
  warmupHours,
}: {
  hourly: MarketHourlyRow[];
  indexValue: number | null;
  hours: number;
  warmupHours: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pts = hourly.filter((r) => r.index_value !== null) as (MarketHourlyRow & {
    index_value: number;
  })[];

  if (indexValue === null || pts.length <= 1) {
    return (
      <p className="text-sm text-[#cfc3b4]">
        Warming up: {hours} of {warmupHours} hours collected.
      </p>
    );
  }

  const W = 560;
  const H = 220;
  const plotW = W;
  const plotH = H;

  const t0 = pts[0].hour;
  const t1 = pts[pts.length - 1].hour || t0 + 1;
  const span = Math.max(1, t1 - t0);

  const x = (t: number) => ((t - t0) / span) * plotW;
  const y = (v: number) => plotH - (v / 100) * plotH;

  const linePoints = pts.map((r) => `${x(r.hour)},${y(r.index_value)}`).join(' ');
  const areaPath = `M ${x(pts[0].hour)},${y(0)} L ${pts
    .map((r) => `${x(r.hour)},${y(r.index_value)}`)
    .join(' L ')} L ${x(pts[pts.length - 1].hour)},${y(0)} Z`;

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(x(pts[i].hour) - svgX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  const active = hoverIdx !== null ? pts[hoverIdx] : null;
  const activeX = active ? x(active.hour) : 0;
  const activeY = active ? y(active.index_value) : 0;

  return (
    <div className="relative">
      <div className="flex items-stretch gap-2">
        <div
          aria-hidden="true"
          className="relative w-7 shrink-0 text-right text-xs leading-none text-[#cfc3b4] tabular-nums select-none"
        >
          {[100, 80, 60, 40, 20, 0].map((g) => (
            <span
              key={g}
              style={{ top: `${100 - g}%` }}
              className="absolute right-0 -translate-y-1/2"
            >
              {g}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="min-w-0 flex-1 h-auto block select-none overflow-visible"
          role="img"
          aria-label="Trench index, last 30 days"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="trench-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e59a28" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#e59a28" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {ZONES.map((z) => {
            const yTop = y(z.max);
            const yBot = y(z.min);
            return (
              <rect
                key={z.label}
                x={0}
                y={yTop}
                width={plotW}
                height={yBot - yTop}
                fill={z.fill}
              />
            );
          })}

          {[0, 20, 40, 60, 80, 100].map((g) => (
            <line
              key={g}
              x1={0}
              x2={plotW}
              y1={y(g)}
              y2={y(g)}
              stroke="#2d251d"
              strokeWidth="1"
            />
          ))}

          <path d={areaPath} fill="url(#trench-area-grad)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#e59a28"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {active && (
            <g>
              <line
                x1={activeX}
                x2={activeX}
                y1={0}
                y2={plotH}
                stroke="#f4ede2"
                strokeOpacity="0.35"
                strokeDasharray="3 3"
              />
              <circle
                cx={activeX}
                cy={activeY}
                r="4.5"
                fill="#e59a28"
                stroke="#110e0b"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        <div
          aria-hidden="true"
          className="flex w-14 shrink-0 flex-col text-xs leading-none text-[#cfc3b4] select-none"
        >
          {ZONES.map((z) => (
            <span key={z.label} className="flex flex-1 items-center">
              {z.label}
            </span>
          ))}
        </div>
      </div>

      {active && (
        <div
          className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-[#2d251d] bg-[#211c16] px-3 py-1.5 text-xs text-[#f4ede2] tabular-nums"
          aria-live="polite"
        >
          <span className="font-semibold text-[#e59a28]">
            {active.index_value} ({zoneName(active.index_value)})
          </span>
          <span className="text-[#cfc3b4]">
            {new Date(active.hour * 1000).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
