import { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { Layout } from './components/Layout';
import { PingToaster, type PingToast } from './components/PingToaster';
import { tabPanelVariants } from './lib/motion';
import { usePersistedState } from './lib/tabState';
import { Market } from './pages/Market';
import { Narratives } from './pages/Narratives';
import { Ping } from './pages/Ping';
import { Tracer } from './pages/Tracer';
import { Watch } from './pages/Watch';
import type {
  AlertItem,
  NarrativesResponse,
  PingResponse,
  TabId,
  WatchCoin,
  WatchResponse,
} from './types';

const MAX_VISIBLE_TOASTS = 4;
const TOAST_DURATION_MS = 30000;
const MAX_SEEN_KEYS = 1000;
const RECENT_ALERT_WINDOW_SEC = 300;
const SEEN_ALERTS_STORAGE_KEY = 'cheesequake:seen-ping-alerts';
const SEEN_NARRATIVE_BANDS_STORAGE_KEY = 'cheesequake:seen-narrative-bands';
const ACTIVE_TAB_STORAGE_KEY = 'cheesequake:tab-state:active-tab';
const VALID_TABS = new Set<TabId>(['market', 'watch', 'ping', 'narratives', 'tracer']);
const NOTIFIABLE_BANDS = new Set(['strong', 'confirm', 'neutral']);

type DomainScope = TabId;
type DomainTicks = Record<DomainScope, number>;
const ALL_SCOPES: DomainScope[] = ['market', 'watch', 'ping', 'narratives', 'tracer'];
const VALID_SCOPES = new Set<string>(ALL_SCOPES);

function isValidTabId(value: unknown): value is TabId {
  return typeof value === 'string' && VALID_TABS.has(value as TabId);
}

function getAlertKey(a: AlertItem): string {
  return `${a.ts}:${a.kind}:${a.mint}:${a.wallet ?? ''}:${a.detail?.usd ?? ''}`;
}

function loadSeenKeys(storageKey: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const keys = parsed.filter((item): item is string => typeof item === 'string');
    return new Set(keys.slice(-MAX_SEEN_KEYS));
  } catch {
    return new Set();
  }
}

function saveSeenKeys(storageKey: string, seen: Set<string>): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(seen)));
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

function trimSeenKeys(seen: Set<string>): boolean {
  if (seen.size <= MAX_SEEN_KEYS) return false;
  const excess = seen.size - MAX_SEEN_KEYS;
  let count = 0;
  for (const k of seen) {
    if (count >= excess) break;
    seen.delete(k);
    count++;
  }
  return true;
}

export default function App() {
  const [activeTab, setActiveTab] = usePersistedState<TabId>(
    ACTIVE_TAB_STORAGE_KEY,
    'market',
    { validate: isValidTabId },
  );
  // Keep Watch mounted once visited so embedded DexScreener chart iframes do not reload on tab switches.
  const [watchVisited, setWatchVisited] = useState(() => activeTab === 'watch');

  useEffect(() => {
    if (activeTab === 'watch') {
      setWatchVisited(true);
    }
  }, [activeTab]);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(() => new Set());
  const [ticks, setTicks] = useState<DomainTicks>({
    market: 0,
    watch: 0,
    ping: 0,
    narratives: 0,
    tracer: 0,
  });
  const [liveStatus, setLiveStatus] = useState<'live' | 'reconnecting'>('reconnecting');
  const liveStatusRef = useRef(liveStatus);
  useEffect(() => {
    liveStatusRef.current = liveStatus;
  }, [liveStatus]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const bumpTicks = useCallback((scopes?: DomainScope[]) => {
    const targets = scopes && scopes.length > 0 ? scopes : ALL_SCOPES;
    setTicks((prev) => {
      const next = { ...prev };
      for (const scope of targets) {
        next[scope] = prev[scope] + 1;
      }
      return next;
    });
  }, []);
  const [toasts, setToasts] = useState<PingToast[]>([]);
  const watchHydratedRef = useRef(false);
  const pingHydratedRef = useRef(false);
  const seenAlertsRef = useRef<Set<string> | null>(null);
  const seenNarrativesRef = useRef<Set<string> | null>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const enqueueToasts = useCallback(
    (fresh: PingToast[]) => {
      if (fresh.length === 0) return;

      for (const toast of fresh) {
        const existing = toastTimersRef.current.get(toast.id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          dismissToast(toast.id);
        }, TOAST_DURATION_MS);
        toastTimersRef.current.set(toast.id, timer);
      }

      setToasts((prev) => {
        const merged = [...prev, ...fresh];
        if (merged.length <= MAX_VISIBLE_TOASTS) return merged;
        const evicted = merged.slice(0, merged.length - MAX_VISIBLE_TOASTS);
        for (const item of evicted) {
          const timer = toastTimersRef.current.get(item.id);
          if (timer) {
            clearTimeout(timer);
            toastTimersRef.current.delete(item.id);
          }
        }
        return merged.slice(merged.length - MAX_VISIBLE_TOASTS);
      });
    },
    [dismissToast],
  );

  const openFromToast = useCallback(
    (toast: PingToast) => {
      setActiveTab(toast.kind === 'narrative' ? 'narratives' : 'ping');
      dismissToast(toast.id);
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      for (const timer of toastTimersRef.current.values()) {
        clearTimeout(timer);
      }
      toastTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/ping')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PingResponse>;
      })
      .then((data) => {
        if (!active) return;
        const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
        if (!seenAlertsRef.current) {
          seenAlertsRef.current = loadSeenKeys(SEEN_ALERTS_STORAGE_KEY);
        }
        const seen = seenAlertsRef.current;
        const isInitialLoad = !pingHydratedRef.current;
        pingHydratedRef.current = true;
        const recentCutoffSec = Math.floor(Date.now() / 1000) - RECENT_ALERT_WINDOW_SEC;

        const fresh: PingToast[] = [];
        let seenChanged = false;
        for (const a of alerts) {
          const key = getAlertKey(a);
          if (seen.has(key)) continue;
          seen.add(key);
          seenChanged = true;
          const isLargeTrade = typeof a.detail?.usd === 'number' && a.detail.usd > 100;
          if (!isLargeTrade) continue;
          if (!isInitialLoad || a.ts >= recentCutoffSec) {
            fresh.push({ id: key, kind: 'ping', alert: a });
          }
        }

        if (trimSeenKeys(seen)) {
          seenChanged = true;
        }

        if (seenChanged) {
          saveSeenKeys(SEEN_ALERTS_STORAGE_KEY, seen);
        }

        enqueueToasts(fresh);
      })
      .catch(() => {
        // Ignore background polling errors; Ping tab surfaces fetch errors.
      });

    return () => {
      active = false;
    };
  }, [ticks.ping, enqueueToasts]);

  useEffect(() => {
    let active = true;
    fetch('/api/narratives')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<NarrativesResponse>;
      })
      .then((data) => {
        if (!active) return;
        const running = Array.isArray(data?.running) ? data.running : [];
        if (!seenNarrativesRef.current) {
          seenNarrativesRef.current = loadSeenKeys(SEEN_NARRATIVE_BANDS_STORAGE_KEY);
        }
        const seen = seenNarrativesRef.current;

        const fresh: PingToast[] = [];
        let seenChanged = false;
        for (const coin of running) {
          if (!NOTIFIABLE_BANDS.has(coin.band)) continue;
          const key = `${coin.mint}:${coin.band}`;
          if (seen.has(key)) continue;
          seen.add(key);
          seenChanged = true;
          fresh.push({ id: `narrative:${key}`, kind: 'narrative', coin });
        }

        if (trimSeenKeys(seen)) {
          seenChanged = true;
        }

        if (seenChanged) {
          saveSeenKeys(SEEN_NARRATIVE_BANDS_STORAGE_KEY, seen);
        }

        enqueueToasts(fresh);
      })
      .catch(() => {
        // Ignore background polling errors; Narratives tab surfaces fetch errors.
      });

    return () => {
      active = false;
    };
  }, [ticks.narratives, enqueueToasts]);

  const syncWatched = useCallback((coins: WatchCoin[] | undefined) => {
    setWatchedSet(new Set((coins || []).map((c) => c.mint)));
    watchHydratedRef.current = true;
  }, []);

  const ensureWatched = useCallback(async () => {
    if (watchHydratedRef.current) return;
    try {
      const res = await fetch('/api/watch');
      const data = (await res.json()) as WatchResponse;
      if (data && Array.isArray(data.coins)) {
        syncWatched(data.coins);
      }
    } catch {
      // Ignore hydration errors; individual views surface API errors.
    }
  }, [syncWatched]);

  useEffect(() => {
    void ensureWatched();
  }, [ensureWatched]);

  const toggleWatch = useCallback(
    async (mint: string) => {
      const method = watchedSet.has(mint) ? 'DELETE' : 'POST';
      const res = await fetch(`/api/watch?mint=${encodeURIComponent(mint)}`, {
        method,
      });
      const data = (await res.json()) as WatchResponse;
      if (data && Array.isArray(data.coins)) {
        syncWatched(data.coins);
      }
      bumpTicks(['watch']);
    },
    [watchedSet, syncWatched, bumpTicks],
  );

  const triggerRefresh = useCallback(() => {
    setRefreshing(true);
    bumpTicks();
    setLastUpdated(new Date());
    setTimeout(() => setRefreshing(false), 300);
  }, [bumpTicks]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/events');
    es.onopen = () => {
      setLiveStatus('live');
    };
    const handleUpdate = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(e.data)) as { scopes?: unknown };
        if (!Array.isArray(parsed?.scopes)) return;
        const valid = parsed.scopes.filter(
          (s): s is DomainScope => typeof s === 'string' && VALID_SCOPES.has(s),
        );
        if (valid.length > 0) {
          bumpTicks(valid);
          setLastUpdated(new Date());
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    es.addEventListener('update', handleUpdate as EventListener);
    es.onerror = () => {
      setLiveStatus('reconnecting');
    };

    return () => {
      es.removeEventListener('update', handleUpdate as EventListener);
      es.close();
    };
  }, [bumpTicks]);

  useEffect(() => {
    const id = setInterval(() => {
      if (liveStatusRef.current !== 'live') {
        bumpTicks();
        setLastUpdated(new Date());
      }
    }, 60000);
    return () => clearInterval(id);
  }, [bumpTicks]);

  return (
    <MotionConfig reducedMotion="user">
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={triggerRefresh}
        liveStatus={liveStatus}
      >
        {activeTab !== 'watch' && (
          <motion.div
            key={activeTab}
            variants={tabPanelVariants}
            initial="initial"
            animate="animate"
          >
            {activeTab === 'market' && <Market refreshTick={ticks.market} />}
            {activeTab === 'ping' && (
              <Ping
                refreshTick={ticks.ping}
                watchedSet={watchedSet}
                onToggleWatch={toggleWatch}
              />
            )}
            {activeTab === 'narratives' && (
              <Narratives
                refreshTick={ticks.narratives}
                watchedSet={watchedSet}
                onToggleWatch={toggleWatch}
              />
            )}
            {activeTab === 'tracer' && <Tracer refreshTick={ticks.tracer} />}
          </motion.div>
        )}
        {watchVisited && (
          <div role="tabpanel" hidden={activeTab !== 'watch'}>
            <motion.div
              variants={tabPanelVariants}
              initial="initial"
              animate={activeTab === 'watch' ? 'animate' : 'initial'}
            >
              <Watch refreshTick={ticks.watch} onSyncWatched={syncWatched} />
            </motion.div>
          </div>
        )}
      </Layout>
      <PingToaster
        toasts={toasts}
        onDismiss={dismissToast}
        onOpenToast={openFromToast}
      />
    </MotionConfig>
  );
}
