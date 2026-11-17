import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AddressLink, Badge } from './ui';
import { fmt, short } from '../lib/format';
import {
  FAST_EASE_OUT,
  QUICK_FADE_TRANSITION,
  SNAPPY_SPRING,
  boundedStaggerDelay,
  fadeInVariants,
} from '../lib/motion';
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
  const [hoveredAddress, setHoveredAddress] = useState<string | null>(null);
  const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);

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
            const isEdgeHighlighted =
              hoveredEdgeIdx === idx ||
              (hoveredAddress !== null &&
                (e.from === hoveredAddress || e.to === hoveredAddress)) ||
              (selectedAddress !== null &&
                (e.from === selectedAddress || e.to === selectedAddress));
            const isDimmed =
              (hoveredAddress !== null ||
                hoveredEdgeIdx !== null ||
                selectedAddress !== null) &&
              !isEdgeHighlighted;
            return (
              <motion.g
                key={`${e.from}-${e.to}-${idx}`}
                onMouseEnter={() => setHoveredEdgeIdx(idx)}
                onMouseLeave={() => setHoveredEdgeIdx(null)}
                className="cursor-pointer"
              >
                <motion.path
                  d={d}
                  fill="none"
                  stroke={isEdgeHighlighted ? '#e59a28' : '#cfc3b4'}
                  strokeWidth={isEdgeHighlighted ? 2.25 : 1.5}
                  markerEnd="url(#tracer-arrow)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: isEdgeHighlighted ? 0.95 : isDimmed ? 0.2 : 0.45,
                  }}
                  transition={{
                    pathLength: {
                      duration: 0.28,
                      delay: boundedStaggerDelay(idx, 0.025),
                      ease: [0.22, 1, 0.36, 1],
                    },
                    opacity: QUICK_FADE_TRANSITION,
                  }}
                />
                <motion.circle
                  cx={x1}
                  cy={y1}
                  r={isEdgeHighlighted ? 3.5 : 2.5}
                  fill={isEdgeHighlighted ? '#e59a28' : '#cfc3b4'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: isEdgeHighlighted ? 1 : 0.75,
                    opacity: isEdgeHighlighted ? 0.95 : isDimmed ? 0.2 : 0.5,
                  }}
                  transition={SNAPPY_SPRING}
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 5}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#e59a28"
                  fillOpacity={isDimmed ? 0.45 : 1}
                  className="tabular-nums"
                >
                  ${fmt(e.usd)}
                </text>
              </motion.g>
            );
          })}

          {nodes.map((n, idx) => {
            const p = pos[n.address];
            const stroke = (n.type && TYPE_COLOR[n.type]) || '#2d251d';
            const isSelected = selectedAddress === n.address;
            const isHovered = hoveredAddress === n.address;
            const dotColor =
              isSelected
                ? '#f4ede2'
                : (n.type && TYPE_COLOR[n.type]) || '#e59a28';
            return (
              <motion.g
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
                onMouseEnter={() => setHoveredAddress(n.address)}
                onMouseLeave={() => setHoveredAddress(null)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...FAST_EASE_OUT,
                  delay: boundedStaggerDelay(idx, 0.03),
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  transformOrigin: `${p.x + nodeW / 2}px ${p.y + nodeH / 2}px`,
                }}
                className="cursor-pointer"
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width={nodeW}
                  height={nodeH}
                  rx="8"
                  fill={isSelected ? '#211c16' : isHovered ? '#1f1a15' : '#191511'}
                  stroke={isSelected ? '#f4ede2' : isHovered ? '#e59a28' : stroke}
                  strokeWidth={n.type || isSelected || isHovered ? 2 : 1.25}
                />
                {(isSelected || isHovered || n.type) && (
                  <motion.circle
                    cx={p.x + nodeW - 12}
                    cy={p.y + 12}
                    r={3}
                    fill={dotColor}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: isSelected || isHovered ? 1.15 : 0.85,
                      opacity: isSelected || isHovered ? 1 : 0.75,
                    }}
                    transition={SNAPPY_SPRING}
                  />
                )}
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
              </motion.g>
            );
          })}
        </svg>
      </div>

      <AnimatePresence mode="wait">
        {selectedNode && (
          <motion.div
            key={selectedNode.address}
            variants={fadeInVariants}
            initial="initial"
            animate="animate"
            exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
            className="rounded-lg border border-[#2d251d] bg-[#211c16] p-3 text-xs space-y-2"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
