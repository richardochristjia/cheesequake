import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '../components/ui';
import { TracerGraph } from '../components/TracerGraph';
import { B58 } from '../lib/format';
import { isString, usePersistedState } from '../lib/tabState';
import type { TracerResponse } from '../types';

const TRACER_INPUT_KEY = 'cheesequake:tab-state:tracer:input';
const TRACER_WALLET_KEY = 'cheesequake:tab-state:tracer:wallet';

const DEFAULT_NOTE =
  'Follows where the money went, hop by hop. Labelled destinations stop the trace; labels come from data/labels.json.';

export function Tracer({ refreshTick }: { refreshTick: number }) {
  const [input, setInput] = usePersistedState<string>(TRACER_INPUT_KEY, '', {
    validate: isString,
  });
  const [traceWallet, setTraceWallet] = usePersistedState<string>(
    TRACER_WALLET_KEY,
    '',
    { validate: isString },
  );
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [data, setData] = useState<TracerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceWallet) return;
    let active = true;
    fetch(`/api/tracer?wallet=${encodeURIComponent(traceWallet)}`)
      .then((r) => r.json() as Promise<TracerResponse>)
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
  }, [traceWallet, refreshTick]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const w = input.trim();
    if (!B58.test(w)) {
      setNote('That is not a valid wallet address.');
      return;
    }
    setNote(DEFAULT_NOTE);
    setTraceWallet(w);
  };

  return (
    <Card title="Tracer">
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Start wallet address"
          aria-label="Start wallet address"
          className="glass-input min-h-[44px] w-full max-w-md rounded-lg px-3 py-2 text-sm text-[#f4ede2] placeholder:text-[#cfc3b4]/70"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-[#e59a28] px-4 py-2 text-sm font-medium text-[#110e0b] hover:bg-[#e59a28]/90 transition-colors cursor-pointer"
        >
          Trace
        </button>
      </form>
      <p className="mt-2 mb-4 text-xs text-[#cfc3b4]">{note}</p>

      {error && (
        <p className="text-sm text-[#fb7185]">Could not load: {error}</p>
      )}

      {!error && data && data.error && (
        <p className="text-sm text-[#fb7185]">{data.error}</p>
      )}

      {!error && data && !data.error && (
        <div className="space-y-3">
          <p className="text-sm text-[#f4ede2]">Status: {data.status}</p>
          <TracerGraph nodes={data.nodes || []} edges={data.edges || []} />
        </div>
      )}
    </Card>
  );
}
