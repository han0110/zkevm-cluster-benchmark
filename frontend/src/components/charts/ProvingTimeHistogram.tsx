/*
 * Histogram of proving time across blocks. Each bar counts the blocks whose proving time lands in its
 * fixed-width bin, so the spread and any slow tail show where the mean and percentiles alone do not.
 * Optional percentile marks draw as dashed vertical lines so the headline figures land visibly on the
 * distribution. Presentational, taking already-computed bin counts at whichever width the caller
 * selected.
 */

import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart } from '@/components/charts/EChart';
import { useThemeColors } from '@/hooks/useThemeColors';
import { namedAxis, emptyChartOption, type AxisTooltipParam } from '@/utils/chartHelpers';
import { bucketRangeLabel } from '@/utils/provingTimeBuckets';

// One percentile reference, a short label such as P50 and its time. A null time, the no-data summary
// value, is skipped rather than drawn.
export interface PercentileMark {
  label: string;
  ms: number | null;
}

interface ProvingTimeHistogramProps {
  labels: string[];
  counts: number[];
  bucketS: number;
  percentiles?: PercentileMark[];
  height?: number;
}

export function ProvingTimeHistogram({ labels, counts, bucketS, percentiles, height = 280 }: ProvingTimeHistogramProps) {
  const colors = useThemeColors();

  const option = useMemo<EChartsCoreOption>(() => {
    if (counts.length === 0) return emptyChartOption('category');

    const marks = (percentiles ?? []).filter((m): m is PercentileMark & { ms: number } => m.ms != null);
    // Fractional category index of a time. Band i spans [i, i + 1) * bucketS with its center at index
    // i, so a time t sits at t / bucketS - 0.5, clamped to the band edges of the axis.
    const toIndex = (ms: number): number =>
      Math.min(counts.length - 0.5, Math.max(-0.5, ms / 1000 / bucketS - 0.5));

    return {
      // Animation off so cycling the bucket width redraws the bars instantly instead of replaying the
      // grow-in effect on every re-bin.
      animation: false,
      // Extra headroom above the bars holds the row of percentile labels.
      grid: { left: 44, right: 18, top: marks.length ? 36 : 16, bottom: 48, containLabel: true },
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
      series: [
        {
          type: 'bar',
          data: counts,
          itemStyle: { color: colors.primary },
          barWidth: '92%',
          markLine: {
            silent: true,
            symbol: 'none',
            animation: false,
            lineStyle: { color: colors.foreground, type: 'dashed', width: 1.2 },
            label: { show: true, position: 'end', formatter: '{b}', color: colors.foreground, fontSize: 10 },
            data: marks.map((m) => ({
              name: m.label,
              xAxis: toIndex(m.ms),
            })),
          },
        },
      ],
    };
  }, [labels, counts, bucketS, percentiles, colors]);

  return <EChart option={option} height={height} />;
}
