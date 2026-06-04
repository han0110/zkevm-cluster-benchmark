/*
 * Block filter model and matching, split from the filter bar so the table imports the predicate alone.
 * A range left at its data-extent bounds imposes no constraint and a narrowed one filters. Status is a
 * set so any combination of outcomes shows at once.
 */

import type { Benchmark, Block, BlockStatus } from '@/types/benchmark';

// One row of the merged blocks table, a block paired with its run. The table combines every run's
// blocks, so each row carries the run index, the run id the detail path needs, and whether this is the
// latest attempt at the block (a patch having superseded earlier ones).
export interface BlockRow {
  block: Block;
  runIndex: number;
  runId: string;
  isLatest: boolean;
}

// Merged rows across every run, each block tagged with its run index, run id, and latest-attempt flag.
// The latest attempt is the one from the latest-started run holding the block, so a patch supersedes the
// earlier ones rather than stacking beside them. One block id can recur across runs, which is why a row
// carries its run index.
export function buildBlockRows(bench: Benchmark): BlockRow[] {
  const latestRunIndex = new Map<string, number>();
  const latestStart = new Map<string, number>();
  bench.runs.forEach((run, ri) => {
    for (const block of run.blocks) {
      const prev = latestStart.get(block.name);
      if (prev == null || run.started_at > prev) {
        latestStart.set(block.name, run.started_at);
        latestRunIndex.set(block.name, ri);
      }
    }
  });
  return bench.runs.flatMap((run, ri) =>
    run.blocks.map(block => ({ block, runIndex: ri, runId: run.id, isLatest: latestRunIndex.get(block.name) === ri }))
  );
}

// A run's filterable extent. Time in seconds, gas in millions. Gas is null when no proof carries a gas
// figure and nodes is null when every block ran on the full cluster, so neither range is offered.
// clusterSize is the full node count, the value the missing-nodes shortcut floors its upper bound below.
export interface BlockBounds {
  time: [number, number];
  gas: [number, number] | null;
  nodes: [number, number] | null;
  clusterSize: number;
}

export interface BlockFilters {
  // The statuses to keep. Empty means every status shows, so the set never hides all rows by default.
  statuses: BlockStatus[];
  time: [number, number];
  gas: [number, number];
  // The participating-node-count range a block must fall in, the number of nodes the proof ran on.
  nodes: [number, number];
  // When set, keeps only the latest attempt at each block, hiding the runs a later run superseded.
  latestOnly: boolean;
}

// The number of nodes a block proved on, the count of its nodes that took part.
export const participatingCount = (block: Block): number => block.nodes.filter(n => n.participated).length;

// The block statuses in display order, the options the status multi-select offers.
export const ALL_STATUSES: BlockStatus[] = ['success', 'crashed', 'timeout'];

// Status text color cue (success green, crashed red, timeout amber) shared by the block table and detail
// heading so the two read the same. A muted fallback keeps an unexpected status legible.
export function statusColor(status: BlockStatus): string {
  if (status === 'success') return 'text-success';
  if (status === 'crashed') return 'text-danger';
  if (status === 'timeout') return 'text-warning';
  return 'text-muted';
}

// Data extent of the proofs, bounding and initializing the range sliders. Only proofs with a proving
// time or gas figure contribute. The node range spans the smallest observed participating count up to
// the full cluster, offered only when some block ran on less than full.
export function blockBounds(blocks: Block[], clusterSize: number): BlockBounds {
  const times = blocks.map(b => b.proving_ms).filter((m): m is number => m != null).map(m => m / 1000);
  const gases = blocks.map(b => b.gas_used).filter((g): g is number => g != null).map(g => g / 1e6);
  const counts = blocks.map(participatingCount);
  const minNodes = counts.length ? Math.min(...counts) : clusterSize;
  return {
    time: times.length ? [Math.min(...times), Math.max(...times)] : [0, 0],
    gas: gases.length ? [Math.min(...gases), Math.max(...gases)] : null,
    nodes: minNodes < clusterSize ? [minNodes, clusterSize] : null,
    clusterSize,
  };
}

// The unfiltered state, every range opened to its full extent, every status shown, and every run shown.
export function fullFilters(bounds: BlockBounds): BlockFilters {
  return { statuses: [], time: bounds.time, gas: bounds.gas ?? [0, 0], nodes: bounds.nodes ?? [0, 0], latestOnly: false };
}

// State a table opens on, the unfiltered extent narrowed to the latest attempt at each block, so a
// patched benchmark reads as one merged result not every run's blocks stacked together.
export function defaultFilters(bounds: BlockBounds): BlockFilters {
  return { ...fullFilters(bounds), latestOnly: true };
}

// Whether a range sits inside its bounds, which is what makes it constrain the set.
const narrowed = (range: [number, number], bound: [number, number]): boolean =>
  range[0] > bound[0] || range[1] < bound[1];

// Whether any filter narrows the set, so the Clear control shows only when it would do something.
export function isFiltering(f: BlockFilters, bounds: BlockBounds): boolean {
  return (
    f.statuses.length > 0 ||
    f.latestOnly ||
    narrowed(f.time, bounds.time) ||
    (bounds.gas != null && narrowed(f.gas, bounds.gas)) ||
    (bounds.nodes != null && narrowed(f.nodes, bounds.nodes))
  );
}

// A one-click filter pill above the table. A preset reads and writes the same filter state the panel
// edits, so it lights up when the state matches and toggles off when clicked while active.
interface BlockPreset {
  id: string;
  label: string;
  // Whether the preset applies at all, used to hide a gas or node preset the data does not support.
  enabled?: (bounds: BlockBounds) => boolean;
  isActive: (f: BlockFilters, bounds: BlockBounds) => boolean;
  toggle: (f: BlockFilters, bounds: BlockBounds) => BlockFilters;
}

// A status shortcut, adding or removing the status from the shown set so several can stack.
function statusPreset(id: string, label: string, status: BlockStatus): BlockPreset {
  return {
    id,
    label,
    isActive: f => f.statuses.includes(status),
    toggle: f => ({
      ...f,
      statuses: f.statuses.includes(status) ? f.statuses.filter(s => s !== status) : [...f.statuses, status],
    }),
  };
}

// An "Ns+" shortcut that floors the proving time at a threshold while opening the upper bound.
function timeFloorPreset(threshold: number): BlockPreset {
  const matches = (f: BlockFilters, b: BlockBounds): boolean => f.time[0] === threshold && f.time[1] === b.time[1];
  return {
    id: `time-${threshold}`,
    label: `${threshold}s+`,
    isActive: matches,
    toggle: (f, b) => (matches(f, b) ? { ...f, time: b.time } : { ...f, time: [threshold, b.time[1]] }),
  };
}

// The node-count range of a missing-cluster proof, one node up to one short of the full cluster.
const missingRange = (clusterSize: number): [number, number] => [1, clusterSize - 1];

// The preset row above the table, the latest-attempt default, the failure and timeout statuses, the
// missing-node shortcut, the slow-proof thresholds, and the heavy-gas threshold.
export const BLOCK_PRESETS: BlockPreset[] = [
  {
    id: 'latest',
    label: 'Latest only',
    isActive: f => f.latestOnly,
    toggle: f => ({ ...f, latestOnly: !f.latestOnly }),
  },
  statusPreset('crashed', 'Crashed', 'crashed'),
  statusPreset('timeout', 'Timeout', 'timeout'),
  {
    id: 'missing-nodes',
    label: 'Missing nodes',
    enabled: b => b.nodes != null,
    isActive: (f, b) => {
      const [lo, hi] = missingRange(b.clusterSize);
      return b.nodes != null && f.nodes[0] === lo && f.nodes[1] === hi;
    },
    toggle: (f, b) => {
      if (b.nodes == null) return f;
      const [lo, hi] = missingRange(b.clusterSize);
      const active = f.nodes[0] === lo && f.nodes[1] === hi;
      return active ? { ...f, nodes: b.nodes } : { ...f, nodes: [lo, hi] };
    },
  },
  timeFloorPreset(9),
  timeFloorPreset(12),
  {
    id: 'gas-50',
    label: '50M+',
    enabled: b => b.gas != null,
    isActive: (f, b) => b.gas != null && f.gas[0] === 50 && f.gas[1] === b.gas[1],
    toggle: (f, b) => {
      if (b.gas == null) return f;
      const active = f.gas[0] === 50 && f.gas[1] === b.gas[1];
      return active ? { ...f, gas: b.gas } : { ...f, gas: [50, b.gas[1]] };
    },
  },
];

// Keeps the rows matching the active filters. The latest-attempt filter drops superseded runs first, a
// non-empty status set keeps only its outcomes, a range at full extent does not constrain, time compares
// in seconds and gas in millions, and the node range is the count that took part.
export function filterBlocks(rows: BlockRow[], f: BlockFilters, bounds: BlockBounds): BlockRow[] {
  const timeActive = narrowed(f.time, bounds.time);
  const gasActive = bounds.gas != null && narrowed(f.gas, bounds.gas);
  const nodesActive = bounds.nodes != null && narrowed(f.nodes, bounds.nodes);
  return rows.filter(({ block: b, isLatest }) => {
    if (f.latestOnly && !isLatest) return false;
    if (f.statuses.length > 0 && !f.statuses.includes(b.status)) return false;
    if (nodesActive) {
      const c = participatingCount(b);
      if (c < f.nodes[0] || c > f.nodes[1]) return false;
    }
    if (timeActive) {
      // A proof with no proving time (a crash) carries no figure to compare, so a narrowed time range
      // drops it rather than treating its missing time as zero seconds.
      if (b.proving_ms == null) return false;
      const seconds = b.proving_ms / 1000;
      if (seconds < f.time[0] || seconds > f.time[1]) return false;
    }
    if (gasActive) {
      const gasM = b.gas_used == null ? null : b.gas_used / 1e6;
      if (gasM == null || gasM < f.gas[0] || gasM > f.gas[1]) return false;
    }
    return true;
  });
}
