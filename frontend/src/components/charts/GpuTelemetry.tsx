/*
 * GPU telemetry stack for Blocks and Metrics. One line chart per metric under one elevated legend.
 * Multi-node draws all GPUs with hue=node and dash=GPU and a Node x GPU legend, single-node gives each
 * GPU its own hue. Uncaptured metrics are omitted, charts share a connect group so hover and zoom sync,
 * and a single selected node overlays its proving phases as bands. Telemetry is columnar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { GroupedLegend, type LegendGroup } from '@/components/common/GroupedLegend';
import { LazyMount } from '@/components/common/LazyMount';
import { MetricChart, type TelemetrySeries, type PhaseBand } from '@/components/charts/MetricChart';
import type { ChartInstance } from '@/components/charts/EChart';
import { useThemeColors } from '@/hooks/useThemeColors';
import { GPU_DASH, nodeColorById, getDataVizColors, cyclic } from '@/utils/dataVizColors';
import { grafanaSelect, highlightArea } from '@/utils/chartHelpers';
import { gpuMetricSeries, gpuCount } from '@/utils/dmon';
import type { Metric, NodeTelemetry } from '@/types/benchmark';

interface GpuTelemetryProps {
  telemetry: Record<string, NodeTelemetry>;
  metricDefs: Metric[];
  nodes: string[];
  // Offset in ms from t0, subtracted so the x-axis reads as seconds since it.
  origin: number;
  windowSec?: [number, number];
  phaseBandsByNode?: Record<string, PhaseBand[]>;
  // Neutral highlight band across every panel, from the selected or hovered phase-timing block.
  highlight?: [number, number];
  // Whether the axis can zoom/scroll. Full-run node view enables it, proof view pins the axis fixed.
  zoomable?: boolean;
  // Shared zoom window in percent and its reporter, owned by the parent so telemetry stays in step with
  // the phase-timing chart. getZoom is read on rebuild so a window survives a legend toggle without
  // rebuilding per wheel tick, onZoom carries the live wheel/drag back.
  getZoom?: () => [number, number];
  onZoom?: (start: number, end: number) => void;
  // Smallest zoom window in axis-value seconds, matching the phase chart's floor.
  minValueSpan?: number;
  // Receives the first metric chart's instance so the parent can drive the stack's zoom imperatively.
  onReady?: (instance: ChartInstance) => void;
  // Painter for the hover band, called imperatively so a hover never re-renders React or stalls the
  // phase chart's tooltip. Takes a seconds window to paint, or null to clear.
  registerHighlight?: (paint: ((window: [number, number] | null) => void) | null) => void;
  group: string;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const gpuCountOf = (node: NodeTelemetry | undefined): number => (node ? gpuCount(node) : 0);

// Reserved height for an unmounted metric panel (chart plus the panel header, divider, and padding) so
// virtualization leaves the scroll position unchanged while offscreen.
const LAZY_RESERVE = 256;

export function GpuTelemetry({
  telemetry,
  metricDefs,
  nodes,
  origin,
  windowSec,
  phaseBandsByNode,
  highlight,
  zoomable = true,
  getZoom,
  onZoom,
  minValueSpan,
  onReady,
  registerHighlight,
  group,
}: GpuTelemetryProps) {
  const colors = useThemeColors();
  const viz = getDataVizColors();

  // Live instances by metric so the hover band paints via a cheap merge of only the highlight series,
  // not a React re-render.
  const instById = useRef<Map<string, ChartInstance>>(new Map());
  useEffect(() => {
    if (!registerHighlight) return;
    registerHighlight((window: [number, number] | null) => {
      const data = window ? highlightArea(colors, window) : [];
      // Drop a disposed instance (a virtualized panel may have unmounted) rather than write to it, which
      // would log an unknown-series warning and waste the paint.
      instById.current.forEach((inst, key) => {
        if (typeof inst.isDisposed === 'function' && inst.isDisposed()) {
          instById.current.delete(key);
          return;
        }
        inst.setOption({ series: [{ id: 'mc-highlight', markArea: { data } }] });
      });
    });
    return () => registerHighlight(null);
  }, [registerHighlight, colors]);

  const colorBy: 'node' | 'gpu' = nodes.length > 1 ? 'node' : 'gpu';
  const maxGpu = useMemo(() => Math.max(1, ...nodes.map(n => gpuCountOf(telemetry[n]))), [telemetry, nodes]);

  const [selNodes, setSelNodes] = useState<Set<string>>(() => new Set(nodes));
  const [selGpus, setSelGpus] = useState<Set<string>>(() => new Set(range(maxGpu).map(String)));

  // Reset node selection when the node set changes (switching run or focused node) so the legend opens
  // with every node enabled.
  const sig = nodes.join(',');
  useEffect(() => setSelNodes(new Set(sig.split(','))), [sig]);

  // Reset GPU selection when the GPU count changes so newly exposed GPUs open enabled.
  useEffect(() => setSelGpus(new Set(range(maxGpu).map(String))), [maxGpu]);

  // When pinned to a window (proof view) only windowed ticks are built, not a point per second of the
  // whole run. Zoomable (full-run node view) keeps the entire series so zooming out reveals it. Padded
  // to match the two-second pad the cells pass clamps to.
  const tickRange = useMemo<[number, number] | undefined>(() => {
    if (zoomable || !windowSec) return undefined;
    const originSec = origin / 1000;
    return [originSec + windowSec[0] - 2, originSec + windowSec[1] + 2];
  }, [zoomable, windowSec, origin]);

  // Heavy pass converts every node-and-GPU pairing to seconds-relative points per metric, once per data
  // change. Each metric records whether the displayed nodes captured it so an empty one is omitted.
  const fullByMetric = useMemo(() => {
    const units = nodes.flatMap(n => range(gpuCountOf(telemetry[n])).map(gpu => ({ node: n, gpu })));
    return metricDefs.map(metric => {
      const allSeries = units.map(u => {
        const node = telemetry[u.node];
        const points = node
          ? gpuMetricSeries(node, u.gpu, metric.name, tickRange).map(p => [(p.t - origin) / 1000, p.value] as [number, number | null])
          : [];
        return { node: u.node, gpu: u.gpu, points };
      });
      const hasData = allSeries.some(s => s.points.some(p => p[1] != null));
      return { metric, allSeries, hasData };
    });
  }, [telemetry, metricDefs, nodes, origin, tickRange]);

  // Fixed y-axis bounds per metric, computed over every node in the run (not just displayed ones) so the
  // scale stays put when the focused node or proof changes. Bounded metrics keep zero-to-cap, unbounded
  // ones span run-wide min to max so variation stays visible.
  const globalRange = useMemo(() => {
    const out: Record<string, [number, number]> = {};
    for (const m of metricDefs) {
      if (m.max != null) {
        out[m.name] = [0, m.max];
        continue;
      }
      let lo = Infinity;
      let hi = -Infinity;
      for (const node of Object.values(telemetry)) {
        const grid = node.metrics[m.name];
        if (!grid) continue;
        for (const gpuRow of grid)
          for (const v of gpuRow)
            if (typeof v === 'number') {
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
      }
      if (!Number.isFinite(lo)) out[m.name] = [0, 1];
      else out[m.name] = [Math.floor(lo), Math.max(Math.ceil(hi), Math.floor(lo) + 1)];
    }
    return out;
  }, [telemetry, metricDefs]);

  const onlyNode = selNodes.size === 1 ? [...selNodes][0] : undefined;
  const bands = colorBy === 'node' && onlyNode ? phaseBandsByNode?.[onlyNode] : undefined;

  // Cheap pass filters to selected identities, clamps to the window, and applies hue and dash.
  const cells = useMemo(() => {
    const pad: [number, number] | undefined = windowSec ? [windowSec[0] - 2, windowSec[1] + 2] : undefined;
    return fullByMetric
      .filter(m => m.hasData)
      .map(({ metric, allSeries }) => {
        const series: TelemetrySeries[] = allSeries
          .filter(s => selNodes.has(s.node) && selGpus.has(String(s.gpu)))
          .map(s => ({
            key: `${s.node}:${s.gpu}`,
            name: colorBy === 'node' ? `${s.node} - GPU ${s.gpu}` : `GPU ${s.gpu}`,
            color: colorBy === 'node' ? nodeColorById(s.node) : cyclic(viz.categorical, s.gpu),
            dash: colorBy === 'node' ? cyclic(GPU_DASH, s.gpu) : 0,
            points: pad ? s.points.filter(p => p[0] >= pad[0] && p[0] <= pad[1]) : s.points,
          }));
        return { metric, series };
      });
  }, [fullByMetric, selNodes, selGpus, windowSec, colorBy, viz]);

  const gpuKeys = useMemo(() => range(maxGpu).map(String), [maxGpu]);
  const legendGroups: LegendGroup[] = useMemo(() => {
    const gpuGroup: LegendGroup = {
      name: 'GPU',
      items: range(maxGpu).map(g => ({
        key: String(g),
        label: String(g),
        color: colorBy === 'node' ? colors.foreground : cyclic(viz.categorical, g),
        dash: colorBy === 'node' ? cyclic(GPU_DASH, g) : undefined,
      })),
      selected: selGpus,
      onToggle: (key, multi) => setSelGpus(prev => grafanaSelect(prev, gpuKeys, key, multi)),
    };
    if (colorBy === 'gpu') return [gpuGroup];
    const nodeGroup: LegendGroup = {
      // Bare node digit so the group reads "Node 1 2 3 4" without a redundant "node" prefix.
      name: 'Node',
      items: nodes.map(n => ({ key: n, label: n.replace(/^node/, '') || n, color: nodeColorById(n) })),
      selected: selNodes,
      onToggle: (key, multi) => setSelNodes(prev => grafanaSelect(prev, nodes, key, multi)),
    };
    return [nodeGroup, gpuGroup];
  }, [nodes, maxGpu, gpuKeys, colorBy, colors, viz, selNodes, selGpus]);

  if (cells.length === 0) {
    return <EmptyState tone="faint">No GPU telemetry was captured for this run.</EmptyState>;
  }

  return (
    // Legend in a sticky side rail, not a top bar, so it stays clickable while the stack scrolls without
    // floating over a chart title.
    <div className="flex gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {cells.map((cell, i) => {
          const [yMin, yMax] = globalRange[cell.metric.name] ?? [0, 1];
          return (
            // Offscreen panels unmount so a synced zoom redraws only visible charts. Panel 0 is pinned
            // because the parent anchors its relay and imperative zoom to that instance, and a remounted
            // panel opens at the live window via getZoom so the connect group stays in step.
            <LazyMount key={cell.metric.name} height={LAZY_RESERVE} pinned={i === 0}>
              <MetricChart
                metric={cell.metric}
                series={cell.series}
                windowSec={windowSec}
                bands={bands}
                highlight={highlight}
                yMin={yMin}
                yMax={yMax}
                zoom={zoomable ? 'sync' : 'none'}
                showSlider={zoomable}
                getZoom={getZoom}
                // Only panel 0 relays its zoom, because the connect group broadcasts any panel's zoom to
                // it, so the parent runs its relay once per tick not once per panel.
                onZoom={zoomable && i === 0 ? onZoom : undefined}
                minValueSpan={minValueSpan}
                onReady={inst => {
                  instById.current.set(cell.metric.name, inst);
                  if (i === 0) onReady?.(inst);
                }}
                group={group}
              />
            </LazyMount>
          );
        })}
      </div>
      <aside className="sticky top-0 h-fit w-20 shrink-0 self-start rounded-lg border border-border bg-surface p-2">
        <GroupedLegend groups={legendGroups} />
      </aside>
    </div>
  );
}
