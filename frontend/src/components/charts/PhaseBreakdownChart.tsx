/*
 * Mean phase breakdown across proving-time buckets, one share-mode StackedPhaseBars row per bucket so
 * reading top to bottom shows how the phase mix shifts as proofs get slower.
 */

import { StackedPhaseBars, type BarRow } from '@/components/charts/StackedPhaseBars';
import type { PhaseRegistry } from '@/utils/phases';
import type { PhaseMean } from '@/utils/phaseTimings';

export interface PhaseBreakdownRow {
  label: string;
  phases: PhaseMean[];
  total: number;
}

export function PhaseBreakdownChart({
  rows,
  registry,
  rowHeight = 26,
}: {
  rows: PhaseBreakdownRow[];
  registry: PhaseRegistry;
  rowHeight?: number;
}) {
  // Every phase mean carries a registry phase name, so its color comes straight from the registry.
  const barRows: BarRow[] = rows.map(r => ({
    label: r.label,
    segments: r.phases.map(p => ({ key: p.key, label: p.label, color: registry.color(p.key), seconds: p.seconds })),
  }));
  return <StackedPhaseBars rows={barRows} mode="share" rowHeight={rowHeight} />;
}
