import type { ReactNode } from 'react';
import {
  Activity,
  Bell,
  Eye,
  GitFork,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { TabId } from '../types';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'market', label: 'Market', icon: Activity },
  { id: 'watch', label: 'Watch', icon: Eye },
  { id: 'ping', label: 'Ping', icon: Bell },
  { id: 'narratives', label: 'Narratives', icon: Sparkles },
  { id: 'tracer', label: 'Tracer', icon: GitFork },
];

export function Layout({
  activeTab,
  onTabChange,
  lastUpdated,
  refreshing,
  onRefresh,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#110e0b] text-[#f4ede2]">
      <header className="border-b border-[#2d251d] bg-[#191511]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect
                width="36"
                height="36"
                rx="9"
                fill="#211c16"
                stroke="#2d251d"
                strokeWidth="1.5"
              />
              <path
                d="M7 24 L18 10 L29 24 Z"
                fill="#e59a28"
                fillOpacity="0.2"
                stroke="#e59a28"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d="M11 24 C14 20, 22 20, 25 24"
                stroke="#f4ede2"
                strokeOpacity="0.7"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="18" cy="17" r="1.5" fill="#e59a28" />
            </svg>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[#f4ede2]">
                Cheesequake
              </h1>
              <p className="text-xs text-[#9c8f80]">
                Research tool. Not trading advice. Scores are untested defaults;
                it never trades.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#9c8f80]">
            {lastUpdated && (
              <span className="tabular-nums hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh now"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#2d251d] bg-[#211c16] px-3 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#e59a28]/50 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#e59a28] ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
        </div>

        <nav
          role="tablist"
          aria-label="Dashboard sections"
          className="mx-auto max-w-6xl px-4 flex flex-wrap gap-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTabChange(id)}
                className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  selected
                    ? 'border-[#e59a28] text-[#f4ede2]'
                    : 'border-transparent text-[#9c8f80] hover:text-[#f4ede2]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${selected ? 'text-[#e59a28]' : 'text-[#9c8f80]'}`}
                  aria-hidden="true"
                />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        {children}
      </main>
    </div>
  );
}
