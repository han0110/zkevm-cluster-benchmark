/*
 * Per-run derivations the detail panels share, the loaded benchmark, focused run, node list, phase
 * registry, and that run's telemetry indexed by node. Node list and registry are benchmark scoped, the
 * telemetry index is run scoped, and each is memoized on its source so a panel rebuilds none of them on
 * an unrelated re-render.
 */

import { useMemo } from 'react';
import { useBench } from '@/hooks/useBench';
import { buildPhaseRegistry } from '@/utils/phases';
import { telemetryByNode } from '@/utils/dmon';
import type { Run } from '@/types/benchmark';

export function useBenchDerived(run: Run) {
  const bench = useBench();
  const nodes = bench.hardware.nodes;
  const registry = useMemo(() => buildPhaseRegistry(bench), [bench]);
  const telemetryById = useMemo(() => telemetryByNode(nodes, run.telemetry), [nodes, run.telemetry]);
  return { bench, run, nodes, registry, telemetryById };
}
