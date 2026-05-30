/*
 * Phase-timing line chart across blocks, one line per phase, legible at the 500-1000 block scale where
 * stacked bars crush into slivers. With a controlled zoom window it reports wheel and drag back so a
 * sibling stays in step, otherwise it zooms self-contained.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { EChart, type ChartInstance } from '@/components/charts/EChart';
import { GroupedLegend, type LegendGroup } from '@/components/common/GroupedLegend';
import { useThemeColors } from '@/hooks/useThemeColors';
import { namedAxis, sliderDataZoom, parseDataZoom, grafanaSelect } from '@/utils/chartHelpers';
import { dash, formatSeconds } from '@/utils/format';
import type { PhaseRegistry } from '@/utils/phases';

interface PhaseTimingChartProps {
  // X-axis category labels, one per block.
  labels: string[];
  // Per-block durations in seconds, keyed by phase name.
  values: Record<string, number[]>;
  registry: PhaseRegistry;
  // Optional per-block total proof time, drawn as the leading dashed envelope line.
  total?: number[];
  height?: number;
  // Zoom window in percent, read on rebuild so it survives a legend toggle without being an option dep
  // (which would rebuild per wheel tick). Live wheel/drag report through onZoom and apply to the
  // instance, so the chart is never controlled.
  getZoom?: () => [number, number];
  onZoom?: (start: number, end: number) => void;
  // Reports the hovered block index so a synced view can mark the matching window, null on mouse out.
  onHoverBlock?: (index: number | null) => void;
  // Smallest zoom window in categories so a deep zoom holds at a legible block count.
  minValueSpan?: number;
  onReady?: (instance: ChartInstance) => void;
}

export function PhaseTimingChart({
  labels,
  values,
  registry,
  total,
  height = 320,
  getZoom,
  onZoom,
  onHoverBlock,
  minValueSpan = 2,
  onReady,
}: PhaseTimingChartProps) {
  const theme = useThemeColors();

  // Legend identities keyed by series name so the selection set drives visibility. Total leads with a
  // dashed swatch matching its envelope line, then one dot per registry phase.
  const items = useMemo(() => {
    const phases = registry.list.map(p => ({ key: p.label, label: p.label, color: p.color }));
    return total ? [{ key: 'Total', label: 'Total', color: theme.muted, dash: [4, 4] as number[] }, ...phases] : phases;
  }, [registry, total, theme]);

  const allKeys = useMemo(() => items.map(i => i.key), [items]);
  // Grafana-style isolation. Opens with every series enabled and resets to all when the series set
  // changes (switching run or focused node).
  const sig = allKeys.join(',');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allKeys));
  useEffect(() => setSelected(new Set(sig.split(','))), [sig]);

  // Y-axis ceiling fixed over every series including the total envelope so isolating one phase never
  // rescales the axis, which would re-render and jump on each click.
  const yMax = useMemo(() => {
    const all = [...(total ?? []), ...registry.list.flatMap(p => values[p.name] ?? [])];
    const peak = all.reduce((m, v) => (v != null && v > m ? v : m), 0);
    return peak > 0 ? Math.ceil(peak * 1.05) : 1;
  }, [values, registry, total]);

  const option = useMemo<EChartsCoreOption>(() => {
    // Symbols off so a thousand-block run reads as clean trends, lttb sampling keeps the path light while
    // preserving peaks.
    const line = (name: string, color: string, data: number[] | undefined, dashed = false) => ({
      name,
      type: 'line' as const,
      showSymbol: false,
      sampling: 'lttb' as const,
      lineStyle: { color, width: dashed ? 1.4 : 1.6, ...(dashed ? { type: 'dashed' as const } : {}) },
      itemStyle: { color },
      emphasis: { focus: 'series' as const },
      data: data ?? [],
    });
    // Total leads as a dashed envelope, then one line per registry phase. Only selected series are
    // emitted so isolating a phase hides the rest without disturbing the fixed axes.
    const series = [
      ...(total ? [line('Total', theme.muted, total, true)] : []),
      ...registry.list.map(phase => line(phase.label, phase.color, values[phase.name])),
    ].filter(s => selected.has(s.name));

    return {
      // Animation off so a wheel zoom applies instantly, keeping scroll smooth and matching the synced
      // telemetry panels.
      animation: false,
      grid: { left: 48, right: 18, top: 12, bottom: 64, containLabel: true },
      // Selectable legend is the elevated GroupedLegend above the chart, so the native one is off.
      legend: { show: false },
      // Tick labels hidden because a run's proofs may be arbitrary fixtures not consecutive blocks, so a
      // dense row of long ids would not read. The axis keeps its categories so zoom and sync work by
      // index.
      xAxis: { type: 'category', data: labels, ...namedAxis('Block', 12), axisLabel: { show: false } },
      // Ceiling fixed over all series so the axis holds steady as the selection changes.
      yAxis: { type: 'value', min: 0, max: yMax, ...namedAxis('Seconds', 36) },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: number | null) => dash(v, formatSeconds),
      },
      dataZoom: sliderDataZoom(theme, ...(getZoom ? getZoom() : [0, 100]), minValueSpan),
      series,
    };
    // getZoom is read for the window but kept out of the deps on purpose so a wheel does not rebuild the
    // option, the window is only re-read when the series or axis change.
  }, [labels, values, registry, total, theme, selected, yMax, getZoom, minValueSpan]);

  // Smallest zoom window as a percentage so the wheel guard knows when the chart is at its floor and
  // cannot zoom in further.
  const floorPct = labels.length > 1 ? (minValueSpan / (labels.length - 1)) * 100 : 100;

  // Wheel and hover bind through the live instance, not the wrapper's onEvents which can miss a rebind.
  // Refs hold the latest callbacks so once-bound handlers never go stale, and the leading off clears any
  // handler left on a reconnected instance.
  const onZoomRef = useRef(onZoom);
  const onHoverRef = useRef(onHoverBlock);
  const floorRef = useRef(floorPct);
  // Current window tracked from the chart's own datazoom events so the wheel guard reads it without a
  // costly getOption. Re-synced on render to the persisted window when synced, else to full, because a
  // standalone chart resets to full on rebuild.
  const zoomRef = useRef<[number, number]>([0, 100]);
  useEffect(() => {
    onZoomRef.current = onZoom;
    onHoverRef.current = onHoverBlock;
    floorRef.current = floorPct;
    zoomRef.current = getZoom ? getZoom() : [0, 100];
  });
  // Captured before echarts so a wheel that would zoom past the floor is swallowed entirely, leaving the
  // window put rather than letting echarts recentre it and drift. Zooming out is left to echarts.
  // Applies to every phase chart, synced or standalone, so the two behave identically.
  const onWheelRef = useRef((e: WheelEvent) => {
    const [s, en] = zoomRef.current;
    if (en - s <= floorRef.current + 0.5 && e.deltaY < 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  const handleReady = useCallback(
    (inst: ChartInstance) => {
      inst.off('datazoom');
      inst.off('updateAxisPointer');
      inst.off('globalout');
      inst.on('datazoom', (p: unknown) => {
        const z = parseDataZoom(p);
        if (z) {
          zoomRef.current = [z.start, z.end];
          onZoomRef.current?.(z.start, z.end);
        }
      });
      inst.on('updateAxisPointer', (p: unknown) => {
        const v = (p as { axesInfo?: Array<{ value?: number | string }> }).axesInfo?.[0]?.value;
        onHoverRef.current?.(v == null ? null : Number(v));
      });
      inst.on('globalout', () => onHoverRef.current?.(null));
      const dom = inst.getDom();
      dom.removeEventListener('wheel', onWheelRef.current, true);
      dom.addEventListener('wheel', onWheelRef.current, { capture: true, passive: false });
      onReady?.(inst);
    },
    [onReady]
  );

  // One legend group of phase identities. Plain click isolates a series, click on the lone selected one
  // resets to all, Cmd/Ctrl click toggles one, matching the GPU telemetry legend.
  const legendGroups: LegendGroup[] = useMemo(
    () => [{ items, selected, onToggle: (key, multi) => setSelected(prev => grafanaSelect(prev, allKeys, key, multi)) }],
    [items, selected, allKeys]
  );

  return (
    <div className="flex flex-col gap-2">
      <GroupedLegend groups={legendGroups} orientation="horizontal" />
      <EChart option={option} height={height} onReady={handleReady} />
    </div>
  );
}
