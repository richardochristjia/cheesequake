import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { PingToaster, type PingToast } from './components/PingToaster';
import { Market } from './pages/Market';
import { Narratives } from './pages/Narratives';
import { Ping } from './pages/Ping';
import { Tracer } from './pages/Tracer';
import { Watch } from './pages/Watch';
import type { AlertItem, PingResponse, TabId, WatchCoin, WatchResponse } from './types';

const MAX_VISIBLE_TOASTS = 4;
const TOAST_DURATION_MS = 30000;
const MAX_SEEN_KEYS = 1000;
const RECENT_ALERT_WINDOW_SEC = 300;
const SEEN_ALERTS_STORAGE_KEY = 'cheesequake:seen-ping-alerts';

function getAlertKey(a: AlertItem): string {
  return `${a.ts}:${a.kind}:${a.mint}:${a.wallet ?? ''}:${a.detail?.usd ?? ''}`;
}

function loadSeenAlerts(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SEEN_ALERTS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const keys = parsed.filter((item): item is string => typeof item === 'string');
    return new Set(keys.slice(-MAX_SEEN_KEYS));
  } catch {
    return new Set();
  }
}

function saveSeenAlerts(seen: Set<string>): void {
  try {
    window.sessionStorage.setItem(SEEN_ALERTS_STORAGE_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('market');
  const [watchedSet, setWatchedSet] = useState<Set<string>>(() => new Set());
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<PingToast[]>([]);
  const watchHydratedRef = useRef(false);
  const pingHydratedRef = useRef(false);
  const seenAlertsRef = useRef<Set<string> | null>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openPingFromToast = useCallback(
    (id: string) => {
      setActiveTab('ping');
      dismissToast(id);
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
          seenAlertsRef.current = loadSeenAlerts();
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
            fresh.push({ id: key, alert: a });
          }
        }

        if (seen.size > MAX_SEEN_KEYS) {
          const excess = seen.size - MAX_SEEN_KEYS;
          let count = 0;
          for (const k of seen) {
            if (count >= excess) break;
            seen.delete(k);
            count++;
          }
          seenChanged = true;
        }

        if (seenChanged) {
          saveSeenAlerts(seen);
        }

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
      })
      .catch(() => {
        // Ignore background polling errors; Ping tab surfaces fetch errors.
      });

    return () => {
      active = false;
    };
  }, [refreshTick, dismissToast]);

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
      setRefreshTick((t) => t + 1);
    },
    [watchedSet, syncWatched],
  );

  const triggerRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshTick((t) => t + 1);
    setLastUpdated(new Date());
    setTimeout(() => setRefreshing(false), 300);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setRefreshTick((t) => t + 1);
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={triggerRefresh}
      >
        {activeTab === 'market' && <Market refreshTick={refreshTick} />}
        {activeTab === 'watch' && (
          <Watch refreshTick={refreshTick} onSyncWatched={syncWatched} />
        )}
        {activeTab === 'ping' && (
          <Ping
            refreshTick={refreshTick}
            watchedSet={watchedSet}
            onToggleWatch={toggleWatch}
          />
        )}
        {activeTab === 'narratives' && (
          <Narratives
            refreshTick={refreshTick}
            watchedSet={watchedSet}
            onToggleWatch={toggleWatch}
          />
        )}
        {activeTab === 'tracer' && <Tracer refreshTick={refreshTick} />}
      </Layout>
      <PingToaster
        toasts={toasts}
        onDismiss={dismissToast}
        onOpenPing={openPingFromToast}
      />
    </>
  );
}
