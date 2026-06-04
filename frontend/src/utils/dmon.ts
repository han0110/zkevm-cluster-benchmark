/*
 * GPU telemetry shaping for the columnar schema, zipping a [gpu][tick] grid into (offset-ms, value)
 * points on their true seconds.
 */

import type { NodeTelemetry, Telemetry } from '@/types/benchmark';

export interface MetricPoint {
  // Millisecond offset from the run epoch, one second per tick.
  t: number;
  value: number | null;
}

// Telemetry node grids keyed by node id, zipping the index-positioned grids against the hardware node
// list into the by-id lookup the block and node views read.
export const telemetryByNode = (nodes: string[], telemetry: Telemetry): Record<string, NodeTelemetry> =>
  Object.fromEntries(nodes.map((id, i) => [id, telemetry.nodes[i]])) as Record<string, NodeTelemetry>;

// Single-GPU series for one metric as (offset-ms, value) points on the one-second axis. An unsampled
// second stays null so a capture gap is never a real reading. tickRange limits the build to a span of
// ticks so a window-pinned view does not allocate a point per second of a long run.
export function gpuMetricSeries(
  node: NodeTelemetry,
  gpu: number,
  key: string,
  tickRange?: readonly [number, number]
): MetricPoint[] {
  const row = node.metrics[key]?.[gpu];
  if (!row) return [];
  const from = tickRange ? Math.max(0, Math.floor(tickRange[0])) : 0;
  const to = tickRange ? Math.min(row.length - 1, Math.ceil(tickRange[1])) : row.length - 1;
  const points: MetricPoint[] = [];
  for (let i = from; i <= to; i++) points.push({ t: i * 1000, value: row[i] ?? null });
  return points;
}

// GPU count for a node, inferred from any present metric grid (all metrics share the gpu dimension).
export function gpuCount(node: NodeTelemetry): number {
  for (const grid of Object.values(node.metrics)) return grid.length;
  return 0;
}
