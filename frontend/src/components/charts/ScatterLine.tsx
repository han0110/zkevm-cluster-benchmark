/*
 * Scatter of gas used vs proving time with a least-squares trend line. Points are colored by their share
 * of the headline compute phase so a phase-bound outlier separates from a merely large proof.
 */

import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart } from '@/components/charts/EChart';
import { useThemeColors } from '@/hooks/useThemeColors';
import { namedAxis, emptyChartOption, type ItemTooltipParam } from '@/utils/chartHelpers';
import { msToSec } from '@/utils/format';
import { blockLabel, type PhaseRegistry } from '@/utils/phases';
import type { PhaseSeries } from '@/utils/phaseTimings';
import type { Block } from '@/types/benchmark';

interface ScatterLineProps {
  blocks: Block[];
  // Cluster critical-path series whose scatter-phase row drives the color of each point.
  cluster: PhaseSeries;
  registry: PhaseRegistry;
  height?: number;
}

// Ordinary least-squares fit returning endpoints across the observed x-range.
function trendEndpoints(points: Array<[number, number]>): Array<[number, number]> {
  const n = points.length;
  if (n < 2) return [];
  const sx = points.reduce((a, [x]) => a + x, 0);
  const sy = points.reduce((a, [, y]) => a + y, 0);
  const sxx = points.reduce((a, [x]) => a + x * x, 0);
  const sxy = points.reduce((a, [x, y]) => a + x * y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return [];
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const xs = points.map(([x]) => x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return [
    [x0, slope * x0 + intercept],
    [x1, slope * x1 + intercept],
  ];
}

export function ScatterLine({ blocks, cluster, registry, height = 360 }: ScatterLineProps) {
  const colors = useThemeColors();

  const option = useMemo<EChartsCoreOption>(() => {
    const sp = registry.scatterPhase;
    // The scatter-phase critical-path seconds per cluster block, looked up by block name.
    const phaseSec = cluster.values[sp.name] ?? [];
    const clusterIndex = new Map(cluster.blocks.map((b, i) => [b.name, i]));
    const rows = blocks.filter(p => p.status === 'success' && p.gas_used != null);
    const labels = rows.map(blockLabel);
    // Dimensions are gas (M), proving time (s), and the headline-phase share that drives the color.
    const data: Array<[number, number, number]> = rows.map(p => {
      const provingSec = msToSec(p.proving_ms ?? 0);
      const ci = clusterIndex.get(p.name);
      const sec = ci != null ? (phaseSec[ci] ?? 0) : 0;
      const fraction = provingSec > 0 ? sec / provingSec : 0;
      return [(p.gas_used as number) / 1e6, provingSec, fraction];
    });
    if (data.length === 0) return emptyChartOption('value');
    const trend = trendEndpoints(data.map(d => [d[0], d[1]]));
    const fractions = data.map(d => d[2]);
    const vmMin = Math.min(...fractions);
    const vmMax = Math.max(...fractions);
    return {
      grid: { left: 56, right: 72, top: 16, bottom: 48, containLabel: true },
      xAxis: { type: 'value', ...namedAxis('Gas used (M)', 30), min: 0 },
      yAxis: { type: 'value', ...namedAxis('Proving time (s)', 40), min: 0 },
      visualMap: {
        seriesIndex: 0,
        dimension: 2,
        min: vmMin,
        max: vmMax,
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'middle',
        itemWidth: 12,
        itemHeight: 60,
        precision: 2,
        text: [`${sp.label} ${(vmMax * 100).toFixed(0)}%`, `${sp.label} ${(vmMin * 100).toFixed(0)}%`],
        textStyle: { color: colors.muted, fontSize: 10 },
        inRange: { color: [colors.accent, sp.color] },
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: ItemTooltipParam<[number, number, number]>) =>
          `${labels[p.dataIndex] ?? ''}<br/>${p.value[0].toFixed(1)} M gas<br/>${p.value[1].toFixed(2)} s<br/>${sp.label} ${(p.value[2] * 100).toFixed(0)}%`,
      },
      series: [
        {
          type: 'scatter',
          data,
          symbolSize: 9,
          itemStyle: { opacity: 0.8 },
        },
        {
          type: 'line',
          data: trend,
          showSymbol: false,
          silent: true,
          lineStyle: { color: colors.faint, width: 2, type: 'dashed' },
        },
      ],
    };
  }, [blocks, cluster, registry, colors]);

  return <EChart option={option} height={height} />;
}
