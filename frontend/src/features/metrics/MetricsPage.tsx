/*
 * Metrics page, a master-detail split of the metrics table and a node detail panel. The open node lives
 * at /metrics/{run_index}/{node_id} since a node recurs across runs. Wiring is useMasterDetailRoute.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useMasterDetailRoute } from '@/hooks/useMasterDetailRoute';
import { ResizableSplit } from '@/components/layout/ResizableSplit';
import { MetricsTable } from '@/features/metrics/MetricsTable';
import { NodeDetail } from '@/features/metrics/NodeDetail';

export function MetricsPage() {
  const bench = useBench();
  const { nodeId } = useParams();
  // Nodes in hardware order, the order the arrow keys step through, the same across every run.
  const nodes = bench.hardware.nodes;

  const { run, selected, activeKey, onClose } = useMasterDetailRoute({
    itemParam: nodeId,
    items: nodes,
    idOf: n => n,
    basePath: '/metrics',
  });

  const detail = useMemo(
    () => (run && selected ? <NodeDetail run={run} node={selected} onClose={onClose} /> : null),
    [run, selected, onClose]
  );

  return (
    <ResizableSplit
      storageKey="metrics-panel-fraction"
      resizeLabel="Resize node detail"
      left={<MetricsTable activeKey={activeKey} />}
      right={detail}
    />
  );
}
