/*
 * Per-run phase registry, the single source of phase identity, order, label, and color, built from
 * software.zkvm.phases (phases are data not code). Colors come from each zkVM's preset by phase name,
 * falling back to the palette by position so a presetless cluster still renders distinct fills. The
 * aggregator-only phase and the scatter-coloring phase are derived generically, not by hardcoded name.
 */

import type { Benchmark, Block } from '@/types/benchmark';
import { resolveCssColorToHex } from '@/utils/color';

// Per-zkVM phase color presets, keyed by zkVM name then phase name, as index.css variables. zisk routes
// its input lead-in to the muted fill, and prove avoids the maple-red reserved for the crash marker so
// the prove fill and crash line never share a color.
const PHASE_PRESETS: Record<string, Record<string, string>> = {
  zisk: {
    input: 'var(--color-phase-muted)',
    emulation: 'var(--color-phase-1)',
    commit: 'var(--color-phase-2)',
    prove: 'var(--color-phase-3)',
    aggregate: 'var(--color-phase-4)',
  },
};

// Position-indexed fallback palette for phases (or whole zkVMs) absent from a preset. At least five
// distinct fills so an unrecognized cluster renders legibly, wrapping for longer presets.
const FALLBACK_PALETTE = [
  'var(--color-phase-1)',
  'var(--color-phase-2)',
  'var(--color-phase-3)',
  'var(--color-phase-4)',
  'var(--color-phase-5)',
  'var(--color-phase-6)',
];

// Resolves a phase color from its zkVM preset by name, falling back to the palette by position.
const phaseColor = (zkvm: string, name: string, index: number): string => {
  const preset = PHASE_PRESETS[zkvm]?.[name];
  const fallback = FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
  return resolveCssColorToHex(preset ?? fallback ?? '#888888');
};

export interface PhaseEntry {
  name: string;
  label: string;
  index: number;
  color: string;
}

export interface PhaseRegistry {
  list: PhaseEntry[];
  byName(name: string): PhaseEntry | undefined;
  color(name: string): string;
  label(name: string): string;
  // Name of the single phase that runs on the aggregator node only, or null when none.
  aggregatorPhase: string | null;
  // Phase whose share of total proving time drives the scatter color gradient.
  scatterPhase: PhaseEntry;
}

const cache = new WeakMap<Benchmark, PhaseRegistry>();

// Builds (and memoizes by benchmark identity) the phase registry for a loaded run.
export function buildPhaseRegistry(benchmark: Benchmark): PhaseRegistry {
  const existing = cache.get(benchmark);
  if (existing) return existing;

  const zkvm = benchmark.software.zkvm.name;
  const list: PhaseEntry[] = benchmark.software.zkvm.phases.map((phase, index) => ({
    name: phase.name,
    label: phase.label,
    index,
    color: phaseColor(zkvm, phase.name, index),
  }));
  const byName = new Map(list.map(entry => [entry.name, entry]));

  const aggregatorPhase = deriveAggregatorPhase(benchmark, list);
  const scatterPhase =
    [...list].reverse().find(entry => entry.name !== aggregatorPhase) ?? list[list.length - 1] ?? list[0];

  const registry: PhaseRegistry = {
    list,
    byName: name => byName.get(name),
    color: name => byName.get(name)?.color ?? '#888888',
    label: name => byName.get(name)?.label ?? name,
    aggregatorPhase,
    scatterPhase: scatterPhase ?? { name: '', label: '', index: 0, color: '#888888' },
  };
  cache.set(benchmark, registry);
  return registry;
}

// Finds the phase present on some but not all nodes of a block, the aggregator-only phase. The search
// spans every run because the cluster shape is shared and a run may hold no clean block to read it from.
function deriveAggregatorPhase(benchmark: Benchmark, list: PhaseEntry[]): string | null {
  const block = benchmark.runs
    .flatMap(r => r.blocks)
    .find(b => b.status === 'success' && b.nodes.length > 0);
  if (!block) return null;
  for (const entry of list) {
    const present = block.nodes.filter(n => n.phases[entry.index] != null).length;
    if (present > 0 && present < block.nodes.length) return entry.name;
  }
  return null;
}

// Display label for a block, its metric file name, which doubles as its stable identifier.
export const blockLabel = (block: Block): string => block.name;
