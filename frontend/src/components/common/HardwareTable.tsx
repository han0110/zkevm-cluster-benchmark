/*
 * Reference node hardware table. Lists every worker node with its shared CPU, memory, and GPU spec,
 * presented through the shared DataTable so the cluster's compute profile reads at a glance.
 */

import { nodeColorById } from '@/utils/dataVizColors';
import { ColorDot } from '@/components/common/ColorDot';
import { DataTable, type DataColumn } from '@/components/common/DataTable';
import type { Hardware } from '@/types/benchmark';

export function HardwareTable({ hardware }: { hardware: Hardware }) {
  const gpus = `${hardware.gpu_models.length} x ${hardware.gpu_models[0] ?? 'unknown'}`;
  const memory = hardware.ram_gib == null ? '-' : `${hardware.ram_gib} GiB`;
  const columns: DataColumn<string>[] = [
    { key: 'node', header: 'Node', render: node => <ColorDot color={nodeColorById(node)} label={node} /> },
    { key: 'cpu', header: 'CPU', render: () => hardware.cpu_model ?? '-' },
    { key: 'memory', header: 'Memory', render: () => memory },
    { key: 'gpus', header: 'GPUs', render: () => gpus },
  ];
  return <DataTable columns={columns} rows={hardware.nodes} rowKey={node => node} />;
}
