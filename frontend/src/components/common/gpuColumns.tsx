/*
 * Shared GPU-rollup table columns for the per-node summary, used by the Metrics page MetricsTable. The
 * caller supplies the leading Node cell as a link to the node detail, and the row type is generic so the
 * page can carry its own run context and add columns around these.
 */

import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { HelpTip } from '@/components/common/HelpTip';
import type { DataColumn } from '@/components/common/DataTable';
import { dash, formatMiBps, formatSeconds } from '@/utils/format';
import type { NodeStats } from '@/types/benchmark';

// One table row, a node id paired with its GPU rollup positioned at the same index in the hardware list.
export interface NodeRow {
  id: string;
  stat: NodeStats;
}

// The minimal run-tagging fields any row needs to render the shared run-index cell.
export interface RunTagged {
  runIndex: number;
  runId: string;
}

// Run-index column shared by the Proofs and Metrics tables. Shows the run index (which sorts the rows)
// and carries the full run id on hover, so the two tables read the same. The caller supplies the header
// so each table keeps its own label semantics.
export function runColumn<R extends RunTagged>(): DataColumn<R> {
  return {
    key: 'run',
    header: 'Run',
    render: r => (
      <span title={r.runId} className="tabular-nums">
        {r.runIndex}
      </span>
    ),
    sortValue: r => r.runIndex,
  };
}

// Color cue for GPU compute utilization, low signals a host-bound cluster. A node without telemetry has
// no value to color so it stays neutral.
const smClass = (sm: number | null): string =>
  sm == null ? 'text-muted' : sm < 60 ? 'text-danger' : sm < 80 ? 'text-warning' : 'text-success';

// What a low mean SM signals, shown on hover of the column header.
const MEAN_SM_HINT = 'mean GPU compute occupancy, where a low value means the cluster is host or memory bound';

// How the thermal throttle figure is derived, shown on the in-header help mark.
const THERMAL_THROTTLE_HINT =
  'Seconds a GPU on this node spent thermally throttled, counted from the per-second telemetry where the thermal-violation flag was set and averaged over the node GPUs.';

// Builds the GPU-rollup columns for a set of node rows. `nodeCell` renders the leading Node cell, which
// differs by page. The row type is generic so a page may carry extra fields and add its own columns. The
// PCIe columns are dropped entirely when no node captured PCIe, so a run without it shows no placeholder
// columns rather than a row of dashes.
export function buildGpuColumns<R extends NodeRow>(rows: R[], nodeCell: (r: R) => ReactNode): DataColumn<R>[] {
  const hasRx = rows.some(r => r.stat.peak_rxpci != null);
  const hasTx = rows.some(r => r.stat.peak_txpci != null);
  return [
    { key: 'node', header: 'Node', render: nodeCell },
    {
      key: 'sm',
      header: <span title={MEAN_SM_HINT}>Mean SM</span>,
      render: r => <span className={cx('font-medium', smClass(r.stat.mean_sm))}>{dash(r.stat.mean_sm, v => `${v.toFixed(0)}%`)}</span>,
    },
    { key: 'temp', header: 'Max temp', render: r => dash(r.stat.max_temp, v => `${v} C`) },
    {
      key: 'throttle',
      header: (
        <span className="inline-flex items-center gap-1">
          Thermal throttle
          <HelpTip text={THERMAL_THROTTLE_HINT} />
        </span>
      ),
      render: r => formatSeconds(r.stat.temp_throttle_seconds, 1),
    },
    ...(hasRx ? [{ key: 'rx', header: 'Peak RX', render: (r: R) => dash(r.stat.peak_rxpci, formatMiBps) }] : []),
    ...(hasTx ? [{ key: 'tx', header: 'Peak TX', render: (r: R) => dash(r.stat.peak_txpci, formatMiBps) }] : []),
  ];
}
