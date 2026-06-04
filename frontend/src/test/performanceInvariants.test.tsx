/*
 * Structural performance invariants, asserted by shape rather than by a millisecond budget so they hold
 * on shared CI hardware. The table must keep its DOM cost bounded by windowing a large row set, and the
 * telemetry series must build only the points inside a requested tick range. Both guard the proof-detail
 * performance fix. Opening a detail on a long run stays cheap because neither the table body nor the
 * telemetry series grows with the whole-run length.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataTable, type DataColumn } from '@/components/common/DataTable';
import { gpuMetricSeries } from '@/utils/dmon';
import type { NodeTelemetry } from '@/types/benchmark';

interface Row {
  id: string;
}

describe('table windowing', () => {
  it('renders only a windowed slice of a large row set into the DOM', () => {
    const total = 500;
    const rows: Row[] = Array.from({ length: total }, (_, i) => ({ id: String(i) }));
    const columns: DataColumn<Row>[] = [{ key: 'id', header: 'ID', render: r => r.id }];
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);

    const rendered = container.querySelectorAll('tbody tr[data-row]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(total);
    // The windowed slice stays small regardless of how many rows the table holds.
    expect(rendered).toBeLessThanOrEqual(60);
    // Spacer rows hold the scroll height for the unrendered rows, so the scrollbar still spans the set.
    expect(container.querySelectorAll('tbody tr[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('telemetry windowing', () => {
  it('builds only the points inside a tick range, not one per second of the whole run', () => {
    const seconds = 600;
    const row: (number | null)[] = Array.from({ length: seconds }, (_, i) => i);
    const node: NodeTelemetry = { metrics: { pwr: [row] } };

    expect(gpuMetricSeries(node, 0, 'pwr')).toHaveLength(seconds);
    const windowed = gpuMetricSeries(node, 0, 'pwr', [100, 130]);
    expect(windowed).toHaveLength(31);
    expect(windowed.length).toBeLessThan(seconds);
  });
});
