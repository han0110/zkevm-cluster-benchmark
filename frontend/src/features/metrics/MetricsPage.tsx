/*
 * Metrics page, a master-detail split of the metrics table and a node detail panel. The open node lives
 * at /metrics/{run_index}/{node_id} since a node recurs across runs. Wiring is useMasterDetailRoute.
 */

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useMasterDetailRoute } from '@/hooks/useMasterDetailRoute';
import { useListArrowNav } from '@/hooks/useListArrowNav';
import { ResizableSplit } from '@/components/layout/ResizableSplit';
import { MetricsTable } from '@/features/metrics/MetricsTable';
import { NodeDetail } from '@/features/metrics/NodeDetail';
import { buildMetricRows, metricRowKey, type MetricRow } from '@/features/metrics/metricRows';

export function MetricsPage() {
  const bench = useBench();
  const { nodeId } = useParams();
  // Nodes in hardware order, the set the open node resolves against so it stays open across runs.
  const nodes = bench.hardware.nodes;

  const { run, selected, activeKey, onClose } = useMasterDetailRoute({
    itemParam: nodeId,
    items: nodes,
    idOf: n => n,
    basePath: '/metrics',
  });

  // The rows the table shows, sorted and spanning runs, the set the arrow keys step through. It lands
  // after the table's first render, so it falls back to the unsorted base set until the sorted order
  // arrives. Each row carries its own run, so stepping moves to whatever row is shown next rather than
  // sticking within the open node's run.
  const [shown, setShown] = useState<MetricRow[]>([]);
  const onVisibleRowsChange = useCallback((rows: MetricRow[]) => setShown(rows), []);
  const baseRows = useMemo(() => buildMetricRows(bench), [bench]);
  const navRows = shown.length ? shown : baseRows;

  useListArrowNav<MetricRow>({
    enabled: selected != null,
    currentKey: activeKey,
    items: navRows,
    keyOf: metricRowKey,
    pathOf: r => `/metrics/${r.runIndex}/${encodeURIComponent(r.id)}`,
  });

  const detail = useMemo(
    () => (run && selected ? <NodeDetail run={run} node={selected} onClose={onClose} /> : null),
    [run, selected, onClose]
  );

  return (
    <ResizableSplit
      storageKey="metrics-panel-fraction"
      resizeLabel="Resize node detail"
      left={<MetricsTable activeKey={activeKey} onVisibleRowsChange={onVisibleRowsChange} />}
      right={detail}
    />
  );
}
