import { AddressLink, Badge } from './ui';
import { fmt, short } from '../lib/format';
import { isNullableString, usePersistedState } from '../lib/tabState';
import type { TracerEdge, TracerNode } from '../types';

const TRACER_SELECTED_ADDRESS_KEY =
  'cheesequake:tab-state:tracer:selected-address';

const TYPE_COLOR: Record<string, string> = {
  exchange: '#5cd093',
  mixer: '#fb7185',
  other: '#e59a28',
};

export function TracerGraph({
  nodes,
  edges,
}: {
  nodes: TracerNode[];
  edges: TracerEdge[];
}) {
  const [selectedAddress, setSelectedAddress] = usePersistedState<string | null>(
    TRACER_SELECTED_ADDRESS_KEY,
    null,
    { validate: isNullableString },
  );

  if (!nodes.length) return null;

  const cols: Record<number, TracerNode[]> = {};
  for (const n of nodes) {
    (cols[n.depth] = cols[n.depth] || []).push(n);
  }
  const depth = Math.max(...Object.keys(cols).map(Number)) + 1;
  const rows = Math.max(...Object.values(cols).map((c) => c.length));
  const nodeW = 160;
  const nodeH = 44;
  const colGap = 210;
  const rowGap = 64;
  const W = depth * colGap + 24;
  const H = rows * rowGap + 24;

  const pos: Record<string, { x: number; y: number }> = {};
  for (const [d, list] of Object.entries(cols)) {
    list.forEach((n, i) => {
      pos[n.address] = {
        x: 12 + Number(d) * colGap,
        y: 12 + i * rowGap,
      };
    });
  }

  const selectedNode = selectedAddress
    ? nodes.find((n) => n.address === selectedAddress) || null
    : null;
  const incoming = selectedNode
    ? edges.filter((e) => e.to === selectedNode.address)
    : [];
  const outgoing = selectedNode
    ? edges.filter((e) => e.from === selectedNode.address)
    : [];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-[#2d251d] bg-[#110e0b] p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          className="max-w-full h-auto"
          role="img"
          aria-label="Fund flow"
        >
          <defs>
            <marker
              id="tracer-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#cfc3b4" fillOpacity="0.7" />
            </marker>
          </defs>

          {edges.map((e, idx) => {
            const a = pos[e.from];
            const b = pos[e.to];
            if (!a || !b) return null;
            const x1 = a.x + nodeW;
            const y1 = a.y + nodeH / 2;
            const x2 = b.x - 4;
            const y2 = b.y + nodeH / 2;
            const cx = (x1 + x2) / 2;
            const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
            return (
              <g key={`${e.from}-${e.to}-${idx}`}>
                <path
                  d={d}
                  fill="none"
                  stroke="#cfc3b4"
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                  markerEnd="url(#tracer-arrow)"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 5}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#e59a28"
                  className="tabular-nums"
                >
                  ${fmt(e.usd)}
                </text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const p = pos[n.address];
            const stroke = (n.type && TYPE_COLOR[n.type]) || '#2d251d';
            const isSelected = selectedAddress === n.address;
            return (
              <g
                key={n.address}
                role="button"
                tabIndex={0}
                aria-label={n.label || short(n.address)}
                onClick={() => setSelectedAddress(n.address)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setSelectedAddress(n.address);
                  }
                }}
                className="cursor-pointer"
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width={nodeW}
                  height={nodeH}
                  rx="8"
                  fill={isSelected ? '#211c16' : '#191511'}
                  stroke={isSelected ? '#f4ede2' : stroke}
                  strokeWidth={n.type || isSelected ? 2 : 1.25}
                />
                <text
                  x={p.x + 10}
                  y={p.y + 18}
                  fontSize="12"
                  fontWeight="600"
                  fill="#f4ede2"
                >
                  {n.label || short(n.address)}
                </text>
                <text
                  x={p.x + 10}
                  y={p.y + 34}
                  fontSize="10"
                  fill="#cfc3b4"
                >
                  {n.type ? n.type : short(n.address)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNode && (
        <div className="rounded-lg border border-[#2d251d] bg-[#211c16] p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <strong className="text-sm text-[#f4ede2]">
                {selectedNode.label || short(selectedNode.address)}
              </strong>
              <AddressLink address={selectedNode.address} />
              {selectedNode.type && (
                <Badge
                  tone={
                    selectedNode.type === 'exchange'
                      ? 'good'
                      : selectedNode.type === 'mixer'
                        ? 'bad'
                        : 'mid'
                  }
                >
                  {selectedNode.type}
                </Badge>
              )}
            </div>
            <span className="text-[#cfc3b4] tabular-nums">
              Hop {selectedNode.depth}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-[#cfc3b4] tabular-nums">
            <span>Incoming transfers: {incoming.length}</span>
            <span>Outgoing transfers: {outgoing.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
