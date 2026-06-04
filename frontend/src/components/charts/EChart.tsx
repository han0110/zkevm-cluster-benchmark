/*
 * Base ECharts wrapper. Registers modules once, then deep-merges a themed base under the caller's option
 * so feature charts declare only their data and overrides. An optional group connects instances for
 * synced tooltip and dataZoom.
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, type JSX } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart, BarChart, CustomChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
} from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

echarts.use([
  LineChart,
  ScatterChart,
  BarChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  LegacyGridContainLabel,
  CanvasRenderer,
]);

const FONT = 'Space Grotesk Variable, system-ui, sans-serif';

type Plain = Record<string, unknown>;

const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Recursively merge plain objects. Arrays and primitives from `over` replace those in `base`. Returns
// unknown so the single cast at the call site is the only unsafe boundary.
function deepMerge(base: Plain, over: Plain): unknown {
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isPlain(b) && isPlain(v) ? (deepMerge(b, v) as Plain) : v;
  }
  return out;
}

// Themed defaults shared by every chart, expressed as a partial ECharts option.
function buildBase(c: ThemeColors): Plain {
  const axisCommon = {
    axisLine: { lineStyle: { color: c.border } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 11 },
    nameTextStyle: { color: c.faint, fontSize: 11 },
    splitLine: { show: false },
  };
  return {
    animationDuration: 300,
    animationEasing: 'cubicOut',
    textStyle: { color: c.foreground, fontFamily: FONT },
    grid: { left: 56, right: 20, top: 24, bottom: 40, containLabel: true },
    xAxis: axisCommon,
    yAxis: axisCommon,
    legend: { textStyle: { color: c.muted }, inactiveColor: c.faint, top: 0 },
    tooltip: {
      // confine keeps the tooltip inside the chart viewport so it is never clipped by the card.
      confine: true,
      backgroundColor: c.elevated,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: [8, 12],
      textStyle: { color: c.foreground, fontSize: 12 },
      axisPointer: { lineStyle: { color: c.faint, type: 'dashed' }, crossStyle: { color: c.faint } },
    },
  };
}

// Live ECharts instance type, so callers attach zrender handlers without importing echarts internals.
export type ChartInstance = ReturnType<ReactEChartsCore['getEchartsInstance']>;

interface EChartProps {
  option: EChartsCoreOption;
  height?: number | string;
  group?: string;
  // ECharts event handlers (click, datazoom, updateAxisPointer, globalout) passed to the instance so
  // charts drive linked views without exposing it.
  onEvents?: Record<string, (params: unknown) => void>;
  // Called with the live instance on every create or reconnect, so a caller's zrender handlers survive
  // the StrictMode recreate a one-shot effect would miss.
  onReady?: (instance: ChartInstance) => void;
}

export const EChart = forwardRef<ReactEChartsCore, EChartProps>(function EChart(
  { option, height = 320, group, onEvents, onReady },
  ref
): JSX.Element {
  const colors = useThemeColors();
  const merged = useMemo(
    () => deepMerge(buildBase(colors), option as Plain) as EChartsCoreOption,
    [colors, option]
  );

  const innerRef = useRef<ReactEChartsCore | null>(null);
  const setRef = useCallback(
    (node: ReactEChartsCore | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  // Assign and connect the group on the live instance. Runs from onChartReady (every fresh instance,
  // including the StrictMode dev recreate) and from a group-keyed effect (a group change on a persisted
  // instance, such as switching focused node). No disconnect cleanup runs because echarts.disconnect is
  // group-wide and would desync the siblings sharing the group.
  const join = useCallback(() => {
    const instance = innerRef.current?.getEchartsInstance();
    if (!instance) return;
    onReady?.(instance);
    if (!group) return;
    (instance as unknown as { group?: string }).group = group;
    echarts.connect(group);
  }, [group, onReady]);

  useEffect(join, [join]);

  return (
    <ReactEChartsCore
      ref={setRef}
      echarts={echarts}
      option={merged}
      notMerge
      lazyUpdate
      onChartReady={join}
      onEvents={onEvents}
      style={{ height, width: '100%' }}
    />
  );
});
