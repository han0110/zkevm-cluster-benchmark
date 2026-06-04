/*
 * One GPU-telemetry metric as a line chart. X-axis is seconds from a reference moment so nodes compare
 * at the same offset, not wall clock. Y-axis uses a fixed run-wide scale so it never jumps when the
 * focused node or proof changes.
 */

import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart, type ChartInstance } from '@/components/charts/EChart';
import { ChartPanel } from '@/components/common/ChartPanel';
import { useThemeColors } from '@/hooks/useThemeColors';
import { syncDataZoom, parseDataZoom, highlightArea, type AxisTooltipParam } from '@/utils/chartHelpers';
import { formatAxisSeconds } from '@/utils/format';
import type { Metric } from '@/types/benchmark';

export interface TelemetrySeries {
  key: string;
  name: string;
  color: string;
  dash: number | number[];
  points: Array<[number, number | null]>;
}

export interface PhaseBand {
  label: string;
  color: string;
  start: number;
  end: number;
}

type ZoomMode = 'none' | 'sync';

interface MetricChartProps {
  metric: Metric;
  series: TelemetrySeries[];
  windowSec?: [number, number];
  bands?: PhaseBand[];
  // Neutral highlight band marking a block time range from the selected or hovered phase-timing bar.
  highlight?: [number, number];
  // Fixed y-axis bounds, computed once over the whole run so the scale does not shift when the focused
  // node or selected proof changes.
  yMin: number;
  yMax: number;
  zoom: ZoomMode;
  showSlider?: boolean;
  // Shared zoom window in percent, read when the option rebuilds so a chosen window survives a notMerge
  // rebuild without being an option dep (which would rebuild per wheel tick). Live wheel/drag report
  // through onZoom and apply to the instance.
  getZoom?: () => [number, number];
  onZoom?: (start: number, end: number) => void;
  // Smallest zoom window in axis-value seconds, matching a synced phase chart's floor.
  minValueSpan?: number;
  group: string;
  height?: number;
  onReady?: (instance: ChartInstance) => void;
}

export function MetricChart({
  metric,
  series,
  windowSec,
  bands,
  highlight,
  yMin,
  yMax,
  zoom,
  showSlider = false,
  getZoom,
  onZoom,
  minValueSpan,
  group,
  height = 170,
  onReady,
}: MetricChartProps) {
  const colors = useThemeColors();

  const onEvents = useMemo(() => {
    if (!onZoom) return undefined;
    return {
      datazoom: (p: unknown) => {
        const z = parseDataZoom(p);
        if (z) onZoom(z.start, z.end);
      },
    };
  }, [onZoom]);

  // Proof-window bounds as primitives so a fresh highlight array on each render does not rebuild the
  // option while a genuine window change still does.
  const hlStart = highlight?.[0];
  const hlEnd = highlight?.[1];

  const option = useMemo<EChartsCoreOption>(() => {
    const bottom = zoom === 'sync' && showSlider ? 40 : 16;

    const lines = series.map(s => ({
      name: s.name,
      type: 'line' as const,
      showSymbol: false,
      // connectNulls bridges an interior gap so the line reads continuously, while a leading or trailing
      // null stays absent (late start or early stop shows no line) since there is no point to connect to.
      connectNulls: true,
      sampling: 'lttb' as const,
      lineStyle: { color: s.color, width: 1.4, type: s.dash === 0 ? 'solid' : (s.dash as number[]) },
      itemStyle: { color: s.color },
      emphasis: { focus: 'series' as const },
      data: s.points,
    }));

    // Phase bands and the proof-window highlight ride on silent placeholder series so they paint
    // regardless of toggled data series. The static highlight rides in the option itself so a notMerge
    // apply always carries it, while the node view repaints a transient hover highlight onto the same
    // series through a cheap merge that touches only it.
    const bandAreas = (bands ?? []).map(b => [
      {
        xAxis: b.start,
        itemStyle: { color: b.color, opacity: 0.14 },
        label: { show: true, formatter: b.label, position: 'insideTop' as const, color: colors.muted, fontSize: 10 },
      },
      { xAxis: b.end },
    ]);
    // Phase bands already mark the window, so the neutral highlight is suppressed when they show.
    const highlightData =
      hlStart != null && hlEnd != null && !(bands && bands.length) ? highlightArea(colors, [hlStart, hlEnd]) : [];
    const markSeries = [
      { id: 'mc-bands', name: '__bands__', type: 'line' as const, data: [] as Array<[number, number]>, silent: true, markArea: { silent: true, data: bandAreas } },
      { id: 'mc-highlight', name: '__highlight__', type: 'line' as const, data: [] as Array<[number, number]>, silent: true, markArea: { silent: true, data: highlightData } },
    ];

    return {
      // Animation off so a zoom does not tween, which on a stack of synced panels would replay an
      // interpolation per panel each wheel tick and stall the scroll.
      animation: false,
      // Elevated GroupedLegend is the only legend, so the native one is suppressed.
      legend: { show: false },
      grid: { left: 18, right: 18, top: 12, bottom, containLabel: true },
      xAxis: {
        type: 'value',
        min: windowSec?.[0],
        max: windowSec?.[1],
        // Fractional window bounds are unlabelled so they never collide with the adjacent round tick,
        // leaving a clean run of whole-second labels.
        axisLabel: { formatter: (v: number) => formatAxisSeconds(v), hideOverlap: true, showMinLabel: false, showMaxLabel: false },
      },
      // A few coarse labels on a fixed run-wide scale give rough magnitude, and fixed bounds keep the
      // axis from jumping when the focused node or proof changes.
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        splitNumber: 2,
        axisLine: { show: false },
      },
      tooltip: {
        trigger: 'axis',
        // The panel is short and carries many rows, so the tooltip stays unconfined or lower series clip
        // out of view. It renders in the fixed, overflow-clipped #chart-tooltip-layer not the document
        // body, so the transform ECharts leaves on the hidden tooltip can never expand the page and
        // scroll the fixed app shell out of view.
        appendTo: '#chart-tooltip-layer',
        confine: false,
        formatter: (params: unknown) => {
          const rows = (params as Array<AxisTooltipParam<[number, number | null]>>)
            .filter(p => p.seriesName !== '__bands__' && p.seriesName !== '__highlight__' && p.value?.[1] != null)
            .sort((a, b) => (b.value[1] as number) - (a.value[1] as number));
          const first = rows[0];
          if (!first) return '';
          const head = `<div style="margin-bottom:4px;font-weight:600">+${formatAxisSeconds(first.value[0])}</div>`;
          const body = rows
            .map(
              p =>
                `<div style="display:flex;gap:8px;align-items:center"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color}"></span><span>${p.seriesName}</span><span style="margin-left:auto;font-weight:600">${(p.value[1] as number).toFixed(1)} ${metric.unit}</span></div>`
            )
            .join('');
          return head + body;
        },
      },
      dataZoom:
        zoom === 'sync' ? syncDataZoom(colors, showSlider, ...(getZoom ? getZoom() : [0, 100]), minValueSpan) : undefined,
      series: [...lines, ...markSeries],
    };
  }, [metric, series, windowSec, bands, hlStart, hlEnd, yMin, yMax, zoom, showSlider, getZoom, minValueSpan, colors]);

  return (
    <ChartPanel title={metric.label} action={<span className="text-xs text-muted">{metric.unit}</span>}>
      <EChart option={option} height={height} group={group} onEvents={onEvents} onReady={onReady} />
    </ChartPanel>
  );
}
