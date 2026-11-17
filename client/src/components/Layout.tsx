import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Bell,
  Eye,
  GitFork,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { BUTTON_TAP, SNAPPY_SPRING } from '../lib/motion';
import type { NotificationItem } from '../App';
import type { TabId } from '../types';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

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
  liveStatus,
  notifications = [],
  onOpenNotification,
  onMarkAllNotificationsRead,
  onClearNotifications,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  liveStatus?: 'live' | 'reconnecting';
  notifications?: NotificationItem[];
  onOpenNotification?: (item: NotificationItem) => void;
  onMarkAllNotificationsRead?: () => void;
  onClearNotifications?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#110e0b] text-[#f4ede2]">
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-scene"
      >
        <svg
          className="h-full w-full opacity-90"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <radialGradient id="orb-amber-tl" cx="0.16" cy="0.14" r="0.38">
              <stop offset="0%" stopColor="#e59a28" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#b87718" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#110e0b" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="orb-amber-br" cx="0.84" cy="0.78" r="0.42">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
              <stop offset="55%" stopColor="#e59a28" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#110e0b" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="wedge-light" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f4ede2" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#e59a28" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="ribbon-gold" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e59a28" stopOpacity="0" />
              <stop offset="50%" stopColor="#e59a28" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#f4ede2" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect width="1440" height="900" fill="url(#orb-amber-tl)" />
          <rect width="1440" height="900" fill="url(#orb-amber-br)" />

          {/* Faceted light wedges */}
          <polygon points="0,0 520,0 240,420 0,260" fill="url(#wedge-light)" />
          <polygon points="1440,80 960,0 1160,460 1440,340" fill="url(#wedge-light)" />
          <polygon points="620,900 940,560 1220,900" fill="url(#wedge-light)" />

          {/* Orbital rings */}
          <circle
            cx="1160"
            cy="210"
            r="175"
            stroke="#e59a28"
            strokeOpacity="0.16"
            strokeWidth="1.2"
          />
          <circle
            cx="1160"
            cy="210"
            r="245"
            stroke="#f4ede2"
            strokeOpacity="0.07"
            strokeWidth="1"
            strokeDasharray="6 8"
          />
          <circle
            cx="240"
            cy="680"
            r="210"
            stroke="#e59a28"
            strokeOpacity="0.12"
            strokeWidth="1"
          />

          {/* Seismic contour ribbons */}
          <path
            d="M-40 540 C 260 460, 520 640, 820 530 C 1080 435, 1260 560, 1480 470"
            stroke="url(#ribbon-gold)"
            strokeWidth="1.75"
          />
          <path
            d="M-40 590 C 280 510, 540 690, 850 575 C 1100 480, 1280 610, 1480 525"
            stroke="url(#ribbon-gold)"
            strokeOpacity="0.55"
            strokeWidth="1.15"
          />
          <path
            d="M-40 640 C 300 565, 560 735, 880 620 C 1120 525, 1300 655, 1480 580"
            stroke="#f4ede2"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        </svg>
      </div>

      <header className="sticky top-0 z-20 glass-header">
        <div className="mx-auto max-w-6xl px-4 py-2.5 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#f4ede2]">
                Cheesequake
              </h1>
              <p className="hidden sm:block text-xs text-[#cfc3b4]">
                Research tool. Not trading advice. Scores are untested defaults;
                it never trades.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#cfc3b4]">
            {liveStatus && (
              <span
                aria-label={
                  liveStatus === 'live'
                    ? 'Live updates connected'
                    : 'Reconnecting live updates'
                }
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  liveStatus === 'live' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    liveStatus === 'live'
                      ? 'bg-emerald-400'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                {liveStatus === 'live' ? 'Live' : 'Reconnecting'}
              </span>
            )}
            {lastUpdated && (
              <span className="tabular-nums hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <NotificationBell
              notifications={notifications}
              onOpenNotification={onOpenNotification ?? (() => {})}
              onMarkAllRead={onMarkAllNotificationsRead ?? (() => {})}
              onClear={onClearNotifications ?? (() => {})}
            />
            <motion.button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh now"
              whileTap={refreshing ? undefined : BUTTON_TAP}
              whileHover={refreshing ? undefined : { y: -0.5 }}
              transition={SNAPPY_SPRING}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#f4ede2]/15 bg-[#211c16]/80 px-3 py-2 text-xs font-medium text-[#f4ede2] hover:border-[#e59a28]/50 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#e59a28] ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </motion.button>
          </div>
        </div>

        <nav
          role="tablist"
          aria-label="Dashboard sections"
          className="mx-auto max-w-6xl px-4 flex flex-nowrap overflow-x-auto gap-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id;
            return (
              <motion.button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTabChange(id)}
                whileTap={BUTTON_TAP}
                transition={SNAPPY_SPRING}
                className={`relative inline-flex shrink-0 min-h-[44px] items-center gap-2 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  selected
                    ? 'text-[#f4ede2]'
                    : 'text-[#cfc3b4] hover:text-[#f4ede2]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${selected ? 'text-[#e59a28]' : 'text-[#cfc3b4]'}`}
                  aria-hidden="true"
                />
                {label}
                {selected && (
                  <motion.span
                    layoutId="active-tab-indicator"
                    aria-hidden="true"
                    transition={SNAPPY_SPRING}
                    className="pointer-events-none absolute inset-x-0 -bottom-[2px] h-0.5 bg-[#e59a28]"
                  />
                )}
              </motion.button>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-6 space-y-4">
        {children}
      </main>
    </div>
  );
}
