/*
 * Row model for the metrics table, one row per node per run of the GPU rollup so the cluster reads
 * across runs at a glance. The page and the table share this builder so the arrow-key navigation steps
 * the same rows the table renders, each carrying the run context the columns and the detail link need.
 */

import type { Benchmark } from '@/types/benchmark';
import type { NodeRow } from '@/components/common/gpuColumns';

// One row, a node's GPU rollup from one run. `id` is the node id, the buildGpuColumns key, and the run
// fields scope the detail link and the arrow-key destination.
export interface MetricRow extends NodeRow {
  runIndex: number;
  runId: string;
  startedAt: number;
}

// The row key shared by the table highlight and the arrow-key cursor, a node scoped to its run.
export const metricRowKey = (r: MetricRow): string => `${r.runIndex}/${r.id}`;

// Builds every node-run row of a benchmark in run then node order, the table's unsorted base set.
export function buildMetricRows(bench: Benchmark): MetricRow[] {
  return bench.runs.flatMap((run, runIndex) =>
    run.statistics.nodes.map((stat, i) => ({
      id: bench.hardware.nodes[i] ?? `node${i + 1}`,
      stat,
      runIndex,
      runId: run.id,
      startedAt: run.started_at,
    }))
  );
}
