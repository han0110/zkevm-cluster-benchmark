/*
 * Histogram of proving time across blocks. Each bar counts the blocks whose proving time lands in its
 * half-second bin, so the spread and any slow tail show where the mean and percentiles alone do not.
 * Presentational, taking already-computed bin counts so they match the linked phase breakdown.
 */

import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart } from '@/components/charts/EChart';
import { useThemeColors } from '@/hooks/useThemeColors';
import { namedAxis, emptyChartOption, type AxisTooltipParam } from '@/utils/chartHelpers';
import { bucketRangeLabel } from '@/utils/provingTimeBuckets';

interface ProvingTimeHistogramProps {
  labels: string[];
  counts: number[];
  bucketS: number;
  height?: number;
}

export function ProvingTimeHistogram({ labels, counts, bucketS, height = 280 }: ProvingTimeHistogramProps) {
  const colors = useThemeColors();

  const option = useMemo<EChartsCoreOption>(() => {
    if (counts.length === 0) return emptyChartOption('category');

    return {
      grid: { left: 44, right: 18, top: 16, bottom: 48, containLabel: true },
      xAxis: { type: 'category', data: labels, ...namedAxis('Proving time (s)', 30), axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', ...namedAxis('Blocks', 32), minInterval: 1 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = (params as AxisTooltipParam[])[0];
          if (!p) return '';
          return `${bucketRangeLabel(p.dataIndex, bucketS)}<br/><b>${p.value}</b> blocks`;
        },
      },
      series: [{ type: 'bar', data: counts, itemStyle: { color: colors.primary }, barWidth: '92%' }],
    };
  }, [labels, counts, bucketS, colors]);

  return <EChart option={option} height={height} />;
}
