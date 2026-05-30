/*
 * Per-block proving-phase durations for the phase-timing charts, keyed by phase name so any zkVM preset
 * works. A node view reports its own per-phase times. The cluster view reports the critical path where a
 * phase cost is the gap between consecutive cluster phase ends, each ending when the last node finishes.
 */

import type { PhaseRegistry } from '@/utils/phases';
import { blockLabel } from '@/utils/phases';
import { msToSec } from '@/utils/format';
import type { Block, PhaseWindow } from '@/types/benchmark';

export interface PhaseSeries {
  // X-axis labels, one per block.
  labels: string[];
  // Per-block durations in seconds, keyed by phase name.
  values: Record<string, number[]>;
  // Total proving seconds per block.
  total: number[];
  // Source blocks aligned with labels, so a caller can map a label index to its block.
  blocks: Block[];
}

// Returns an empty per-phase-name accumulator for the registry's phases.
const emptyValues = (registry: PhaseRegistry): Record<string, number[]> =>
  Object.fromEntries(registry.list.map(p => [p.name, []]));

// Seconds-since-block-start (start, end) of a phase window, or null when absent. The single window the
// Gantt rows, per-proof telemetry bands, and cluster critical path all rebase from.
export const windowSeconds = (win: PhaseWindow | null): { start: number; end: number } | null =>
  win ? { start: msToSec(win.start_ms), end: msToSec(win.start_ms + win.dur_ms) } : null;

// Seconds-since-block-start of the end of a window, or null when the window is absent.
const endSec = (win: PhaseWindow | null): number | null => windowSeconds(win)?.end ?? null;

// Per-block phase durations for one node from its own phase windows. The aggregate phase is non-zero
// only on the blocks the node aggregated.
export function nodePhaseSeries(blocks: Block[], nodeIndex: number, registry: PhaseRegistry): PhaseSeries {
  const labels: string[] = [];
  const values = emptyValues(registry);
  const total: number[] = [];
  const out: Block[] = [];
  for (const block of blocks) {
    const node = block.nodes[nodeIndex];
    if (!node) continue;
    labels.push(blockLabel(block));
    out.push(block);
    for (const phase of registry.list) {
      const win = node.phases[phase.index] ?? null;
      values[phase.name]?.push(win ? msToSec(win.dur_ms) : 0);
    }
    // A crashed proof carries no whole-proof time, so its total envelope reads as zero.
    total.push(block.proving_ms != null ? msToSec(block.proving_ms) : 0);
  }
  return { labels, values, total, blocks: out };
}

// Per-block cluster critical-path phase costs. Each phase ends when the last node finishes it, so a
// phase cost is the gap from the previous phase's cluster end, reckoned from the block start.
export function clusterPhaseSeries(blocks: Block[], registry: PhaseRegistry): PhaseSeries {
  const labels: string[] = [];
  const values = emptyValues(registry);
  const total: number[] = [];
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.status !== 'success' || block.nodes.length === 0) continue;
    labels.push(blockLabel(block));
    out.push(block);

    let prevEnd = 0;
    for (const phase of registry.list) {
      const ends = block.nodes
        .map(n => endSec(n.phases[phase.index] ?? null))
        .filter((v): v is number => v != null);
      const end = ends.length ? Math.max(...ends) : prevEnd;
      values[phase.name]?.push(Math.max(0, end - prevEnd));
      prevEnd = Math.max(prevEnd, end);
    }
    total.push(prevEnd);
  }
  return { labels, values, total, blocks: out };
}

export interface PhaseMean {
  key: string;
  label: string;
  seconds: number;
}

// Mean cluster critical-path cost of each phase across all successful blocks.
export function meanClusterPhases(blocks: Block[], registry: PhaseRegistry): { phases: PhaseMean[]; total: number } {
  const series = clusterPhaseSeries(blocks, registry);
  const n = series.labels.length || 1;
  const mean = (arr: number[]): number => arr.reduce((sum, v) => sum + v, 0) / n;
  const phases: PhaseMean[] = registry.list.map(phase => ({
    key: phase.name,
    label: phase.label,
    seconds: mean(series.values[phase.name] ?? []),
  }));
  const total = phases.reduce((sum, p) => sum + p.seconds, 0) || 1;
  return { phases, total };
}
