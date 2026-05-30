/*
 * Per-proof overview fields shared by the proof detail strip and the proofs table so the two never
 * drift. Each field renders a block to a display string and exposes a numeric sort value.
 */

import type { Block } from '@/types/benchmark';
import type { PhaseRegistry } from '@/utils/phases';
import { dash, formatBytes, formatCompact, formatSeconds, msToSec } from '@/utils/format';

export interface ProofField {
  key: string;
  label: string;
  render: (block: Block, registry: PhaseRegistry) => string;
  // Numeric value the proofs table sorts on, null where the block carries no value for the field.
  sortValue: (block: Block, registry: PhaseRegistry) => number | null;
}

// Proof size formatted as KiB with a single decimal, the natural unit for the few-hundred-KiB proofs.
const formatProofSize = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

// Phase-mix segments for a block, read from the aggregator node because it carries the full pipeline.
export function phaseMixSegments(block: Block, registry: PhaseRegistry): { value: number; color: string }[] {
  const aggIndex = registry.aggregatorPhase ? registry.byName(registry.aggregatorPhase)?.index : undefined;
  const mixNode =
    aggIndex != null ? block.nodes.find(n => n.phases[aggIndex] != null) ?? block.nodes[0] : block.nodes[0];
  return registry.list.map(phase => ({ value: mixNode?.phases[phase.index]?.dur_ms ?? 0, color: phase.color }));
}

// Per-node emulation rates in MHz, the block step count over each node's emulation-phase seconds. Empty
// when the block has no step count or no node ran a non-empty emulation phase.
function emulationRates(block: Block, registry: PhaseRegistry): number[] {
  const steps = block.meta.steps;
  const emulation = registry.byName('emulation');
  if (steps == null || !emulation) return [];
  return block.nodes
    .map(n => n.phases[emulation.index])
    .filter((w): w is NonNullable<typeof w> => w != null && w.dur_ms > 0)
    .map(w => steps / (w.dur_ms / 1000) / 1e6);
}

// Min and max emulation rate across the block's nodes in MHz, collapsed to a single value when equal.
function emulationRange(block: Block, registry: PhaseRegistry): string {
  const rates = emulationRates(block, registry);
  if (rates.length === 0) return '-';
  const lo = Math.round(Math.min(...rates));
  const hi = Math.round(Math.max(...rates));
  return lo === hi ? `${lo} MHz` : `${lo} - ${hi} MHz`;
}

// Proof overview metrics in display order. Proving time is keyed 'time' so the proofs table can promote
// it to a leading column while the detail strip renders the list as-is.
export function proofOverviewFields(): ProofField[] {
  return [
    {
      key: 'time',
      label: 'Proving time',
      render: b => dash(b.proving_ms, ms => formatSeconds(msToSec(ms))),
      sortValue: b => b.proving_ms,
    },
    { key: 'gas', label: 'Gas used', render: b => dash(b.gas_used, formatCompact), sortValue: b => b.gas_used },
    { key: 'proof_size', label: 'Proof Size', render: b => dash(b.proof_size, formatProofSize), sortValue: b => b.proof_size },
    {
      key: 'verify',
      label: 'Verify',
      render: b => dash(b.verification_time_ms, ms => `${ms} ms`),
      sortValue: b => b.verification_time_ms,
    },
    { key: 'steps', label: 'Steps', render: b => dash(b.meta.steps, formatCompact), sortValue: b => b.meta.steps ?? null },
    { key: 'input', label: 'Input', render: b => dash(b.meta.input_size, formatBytes), sortValue: b => b.meta.input_size ?? null },
    {
      key: 'emulation',
      label: 'Emulation',
      render: (b, r) => emulationRange(b, r),
      // The fastest node rate represents the block, because one slow node would otherwise hide a fast
      // proof in the ordering.
      sortValue: (b, r) => {
        const rates = emulationRates(b, r);
        return rates.length ? Math.max(...rates) : null;
      },
    },
  ];
}
