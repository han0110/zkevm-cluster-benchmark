/*
 * Per-node proving timeline as a time-mode StackedPhaseBars, one row per node. Every row emits the same
 * fixed gap-and-fill column layout in registry order so the stacked-bar component reads slot colors and
 * labels from the first row and still aligns every node. An unrun phase emits a zero-width fill.
 */

import { StackedPhaseBars, type BarMarker, type BarRow, type BarSegment } from '@/components/charts/StackedPhaseBars';
import { windowSeconds } from '@/utils/phaseTimings';
import { resolveCssColorToHex } from '@/utils/color';
import { msToSec } from '@/utils/format';
import type { PhaseRegistry } from '@/utils/phases';
import type { Block } from '@/types/benchmark';

// Marker colors, maple red for a crash and faint grey for a cancel. Resolved lazily on first use, not at
// module load, because resolving before index.css is applied (this module is imported before the
// stylesheet) computes an unresolved var() to inherited near-white. By first render the stylesheet is in
// place so the read returns the real color.
let markerColors: { crash: string; cancel: string } | null = null;
function getMarkerColors(): { crash: string; cancel: string } {
  if (!markerColors) {
    markerColors = {
      crash: resolveCssColorToHex('var(--color-crash)'),
      cancel: resolveCssColorToHex('var(--color-cancel)'),
    };
  }
  return markerColors;
}

export function Gantt({ block, nodes, registry, height = 250 }: { block: Block; nodes: string[]; registry: PhaseRegistry; height?: number }) {
  const seg = (key: string, label: string, color: string, seconds: number, transparent = false): BarSegment => ({
    key,
    label,
    color,
    seconds: Math.max(0, seconds),
    ...(transparent ? { transparent: true } : {}),
  });

  const rows: BarRow[] = block.nodes.map((node, nodeIndex) => {
    // Each phase window in seconds since block start, from the node's own windows. The aggregate (last)
    // window is null on every node but the aggregator.
    const windows = registry.list.map(phase => windowSeconds(node.phases[phase.index] ?? null));

    const segments: BarSegment[] = [];
    let prevEnd = 0;
    registry.list.forEach((phase, i) => {
      const win = windows[i];
      // Every phase emits its gap-and-fill pair so the column layout is identical across rows. An absent
      // phase contributes zero-width segments yet keeps its real color, because the stacked-bar component
      // reads each column's color and label from the first row.
      segments.push(seg(`gap-${phase.name}`, 'gap', 'transparent', win ? win.start - prevEnd : 0, true));
      segments.push(seg(phase.name, phase.label, phase.color, win ? win.end - win.start : 0));
      if (win) prevEnd = win.end;
    });
    // A node that took no part is drawn as a hatched ghost band not empty phases, so it reads as absent
    // from the run rather than a node that did nothing.
    const label = nodes[nodeIndex] ?? `node${nodeIndex + 1}`;
    return node.participated
      ? { label, segments }
      : { label, segments, absent: true, absentLabel: 'did not participate' };
  });

  // Each node that ended early gets a marker on its row at its end second, a crash for the node the
  // cluster lost and a cancel for one stopped after a sibling crashed, so a reader sees which node
  // failed, which were cancelled in its wake, and how far each reached when the proof died.
  const colors = getMarkerColors();
  const markers: BarMarker[] = block.nodes.flatMap((node, nodeIndex) => {
    if (node.crashed_ms == null) return [];
    const cancelled = node.crash_kind === 'cancelled';
    return [
      {
        row: nodeIndex,
        seconds: msToSec(node.crashed_ms),
        label: cancelled ? 'cancel' : 'crash',
        color: cancelled ? colors.cancel : colors.crash,
      },
    ];
  });

  return <StackedPhaseBars rows={rows} mode="time" height={height} markers={markers} />;
}
