import { useEffect, useState } from 'react';
import { Card, Badge } from '../components/ui';
import { TrenchChart } from '../components/TrenchChart';
import type { MarketResponse } from '../types';

export function Market({ refreshTick }: { refreshTick: number }) {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/market')
      .then((r) => r.json() as Promise<MarketResponse>)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refreshTick]);

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
    <div className="space-y-4">
      <Card
        title="Trench index"
        subtitle="Cold, Cool, Neutral, Hot, Euphoria. Percentile of five launch and trading measures against the last 30 days."
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[22px] font-semibold tracking-tight text-[#f4ede2] tabular-nums">
            {val === null ? '--' : val}
          </span>
          <Badge tone={zoneTone} className="text-sm px-2.5 py-1">
            {data.index.zone}
          </Badge>
        </div>
      </Card>

      <Card title="Last 30 days">
        <TrenchChart
          hourly={data.hourly}
          indexValue={data.index.value}
          hours={data.hours}
          warmupHours={data.warmupHours}
        />
      </Card>
    </div>
  );
}
