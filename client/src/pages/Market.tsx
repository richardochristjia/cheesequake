import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Card, Badge } from '../components/ui';
import { TrenchChart } from '../components/TrenchChart';
import {
  FAST_EASE_OUT,
  staggerContainerVariants,
  staggerItemVariants,
  useRefreshHighlight,
} from '../lib/motion';
import type { MarketResponse } from '../types';

export function Market({ refreshTick }: { refreshTick: number }) {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { highlightClass, triggerHighlight } = useRefreshHighlight();
  const prevTickRef = useRef(refreshTick);

  useEffect(() => {
    let active = true;
    const isTickRefresh = prevTickRef.current !== refreshTick;
    prevTickRef.current = refreshTick;

    fetch('/api/market')
      .then((r) => r.json() as Promise<MarketResponse>)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
        if (isTickRefresh) triggerHighlight();
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refreshTick, triggerHighlight]);

  if (error) {
    return (
      <Card title="Market">
        <p className="text-sm text-[#fb7185]">Could not load: {error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Trench index">
        <p className="text-sm text-[#ebe2d5]">Loading…</p>
      </Card>
    );
  }

  const val = data.index.value;
  const zoneTone =
    val === null
      ? 'mut'
      : val >= 80
        ? 'bad'
        : val >= 60
          ? 'mid'
          : val >= 20
            ? 'good'
            : 'mut';

  return (
    <motion.div
      className="space-y-4"
      variants={staggerContainerVariants}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={staggerItemVariants}>
        <Card
          title="Trench index"
          subtitle="Cold, Cool, Neutral, Hot, Euphoria. Percentile of five launch and trading measures against the last 30 days."
          className={highlightClass}
        >
          <div className="flex items-baseline gap-3">
            <motion.span
              key={val ?? 'empty'}
              initial={{ opacity: 0.7, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={FAST_EASE_OUT}
              className="text-3xl font-semibold tracking-tight text-[#f4ede2] tabular-nums"
            >
              {val === null ? '--' : val}
            </motion.span>
            <Badge tone={zoneTone} className="text-sm px-2.5 py-1">
              {data.index.zone}
            </Badge>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={staggerItemVariants}>
        <Card title="Last 30 days" className={highlightClass}>
          <TrenchChart
            hourly={data.hourly}
            indexValue={data.index.value}
            hours={data.hours}
            warmupHours={data.warmupHours}
          />
        </Card>
      </motion.div>
    </motion.div>
  );
}
