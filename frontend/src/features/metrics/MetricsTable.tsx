/*
 * Metrics table, one row per node per run of the GPU rollup so the cluster reads across runs at a glance.
 * The node id links to the node detail, and the GPU columns are shared with the Overview via
 * buildGpuColumns so the figures read the same.
 */

import { Link } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useRunSearch } from '@/hooks/useRunSearch';
import { DataTable, type DataColumn } from '@/components/common/DataTable';
import { ColorDot } from '@/components/common/ColorDot';
import { buildGpuColumns, runColumn, type NodeRow } from '@/components/common/gpuColumns';
import { cx } from '@/utils/cx';
import { FOCUS_RING } from '@/utils/styles';
import { formatDateTime } from '@/utils/format';
import { nodeColorById } from '@/utils/dataVizColors';

// One row, a node's GPU rollup from one run, carrying the run context the added columns and detail link
// need. `id` is the node id (the buildGpuColumns key), the run id scopes the link.
interface MetricRow extends NodeRow {
  runIndex: number;
  runId: string;
  startedAt: number;
}

// A run's start as a compact local date and time. The started_at column sorts on the raw epoch and
// shows this text.
const formatStartedAt = (ms: number): string =>
  formatDateTime(ms, { month: 'short', day: '2-digit' }, { hour: '2-digit', minute: '2-digit', hour12: false });

const rowKeyOf = (r: MetricRow): string => `${r.runIndex}/${r.id}`;

export function MetricsTable({ activeKey }: { activeKey?: string }) {
  const bench = useBench();
  const search = useRunSearch();

  const rows: MetricRow[] = bench.runs.flatMap((run, ri) =>
    run.statistics.nodes.map((stat, i) => ({
      id: bench.hardware.nodes[i] ?? `node${i + 1}`,
      stat,
      runIndex: ri,
      runId: run.id,
      startedAt: run.started_at,
    }))
  );

  const gpu = buildGpuColumns<MetricRow>(rows, r => (
    <Link
      to={{ pathname: `/metrics/${r.runIndex}/${encodeURIComponent(r.id)}`, search }}
      className={cx('rounded-sm hover:underline', FOCUS_RING)}
    >
      <ColorDot color={nodeColorById(r.id)} label={r.id} />
    </Link>
  ));
  const [nodeCol, ...rest] = gpu;

  // The node cell leads, then the run it belongs to and that run's start, then the shared GPU rollup.
  const runColumns: DataColumn<MetricRow>[] = [
    runColumn<MetricRow>(),
    {
      key: 'started_at',
      header: 'Started',
      render: r => <span className="tabular-nums">{formatStartedAt(r.startedAt)}</span>,
      sortValue: r => r.startedAt,
    },
  ];
  const columns: DataColumn<MetricRow>[] = nodeCol ? [nodeCol, ...runColumns, ...rest] : [...runColumns, ...rest];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKeyOf}
        activeRowKey={activeKey}
        tableId={`metrics:${bench.id}`}
        className="min-h-0 flex-1 overflow-y-auto"
      />
    </div>
  );
}
