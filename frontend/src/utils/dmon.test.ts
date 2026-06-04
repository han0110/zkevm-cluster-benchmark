import { describe, it, expect } from 'vitest';
import { gpuMetricSeries } from '@/utils/dmon';
import type { NodeTelemetry } from '@/types/benchmark';

// One node, one gpu, six one-second samples with two unsampled seconds left null.
const node: NodeTelemetry = { metrics: { pwr: [[10, null, 30, 40, null, 60]] } };

describe('gpuMetricSeries', () => {
  it('maps each tick to its one-second offset and keeps an unsampled second null', () => {
    const series = gpuMetricSeries(node, 0, 'pwr');
    expect(series.map(p => p.t)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    // A capture gap stays null so it is never read as a measured zero.
    expect(series.map(p => p.value)).toEqual([10, null, 30, 40, null, 60]);
  });

  it('builds only the points inside a tick range, clamped to the row bounds', () => {
    const windowed = gpuMetricSeries(node, 0, 'pwr', [1, 3]);
    expect(windowed.map(p => p.t)).toEqual([1000, 2000, 3000]);
    expect(windowed.map(p => p.value)).toEqual([null, 30, 40]);
    // A range past the row end clamps to the last tick rather than padding beyond the data.
    expect(gpuMetricSeries(node, 0, 'pwr', [4, 99]).map(p => p.t)).toEqual([4000, 5000]);
    // A negative lower bound floors at the first tick.
    expect(gpuMetricSeries(node, 0, 'pwr', [-5, 1]).map(p => p.t)).toEqual([0, 1000]);
  });

  it('returns nothing for an absent gpu or metric', () => {
    expect(gpuMetricSeries(node, 1, 'pwr')).toEqual([]);
    expect(gpuMetricSeries(node, 0, 'absent')).toEqual([]);
  });
});
