import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { Card } from './components/ui';
import { Market } from './pages/Market';
import { Ping } from './pages/Ping';
import { Watch } from './pages/Watch';
import type { TabId, WatchCoin, WatchResponse } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('market');
  const [watchedSet, setWatchedSet] = useState<Set<string>>(() => new Set());
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const watchHydratedRef = useRef(false);

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
      {(activeTab === 'narratives' || activeTab === 'tracer') && (
        <Card title={activeTab[0].toUpperCase() + activeTab.slice(1)}>
          <p className="text-sm text-[#9c8f80]">
            View pending Phase 4 implementation.
          </p>
        </Card>
      )}
    </Layout>
  );
}
