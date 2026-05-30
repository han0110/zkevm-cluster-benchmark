/*
 * Proof detail panel, the right side of the merged Proofs page. Renders one proof's overview figures,
 * per-node timeline, and GPU telemetry over the proving window. The shared DetailPanel supplies the
 * scrolling shell, the Overview heading with a status badge, and the close control.
 */

import { useMemo } from 'react';
import { DetailPanel } from '@/components/common/DetailPanel';
import { ChartSection } from '@/components/common/ChartSection';
import { ChartCard } from '@/components/common/ChartCard';
import { EmptyState } from '@/components/common/EmptyState';
import { StatStrip } from '@/components/common/StatStrip';
import { Gantt } from '@/components/charts/Gantt';
import { GpuTelemetry } from '@/components/charts/GpuTelemetry';
import type { PhaseBand } from '@/components/charts/MetricChart';
import { cx } from '@/utils/cx';
import { useBenchDerived } from '@/hooks/useBenchDerived';
import type { PhaseRegistry } from '@/utils/phases';
import { windowSeconds } from '@/utils/phaseTimings';
import { msToSec } from '@/utils/format';
import { proofOverviewFields } from '@/features/proofs/proofOverview';
import { statusColor, statusLabel } from '@/features/proofs/proofFilters';
import type { Block, Run } from '@/types/benchmark';

// Per-node proving-phase windows in seconds since block start, banding the telemetry when a single node
// is in focus. Each window comes from that node's own phase windows, so the aggregate phase appears only
// on the aggregator's row.
function phaseBands(block: Block, nodes: string[], registry: PhaseRegistry): Record<string, PhaseBand[]> {
  const out: Record<string, PhaseBand[]> = {};
  block.nodes.forEach((node, i) => {
    const id = nodes[i];
    if (!id) return;
    const bands: PhaseBand[] = registry.list.flatMap(phase => {
      const sec = windowSeconds(node.phases[phase.index] ?? null);
      return sec ? [{ label: phase.label, color: phase.color, start: sec.start, end: sec.end }] : [];
    });
    out[id] = bands.filter(b => b.end > b.start);
  });
  return out;
}

export function ProofDetail({ run, block, onClose }: { run: Run; block: Block; onClose: () => void }) {
  const { nodes, registry, telemetryById } = useBenchDerived(run);

  const provingSec = block.proving_ms != null ? msToSec(block.proving_ms) : null;
  // End of the trace in seconds. A successful proof ends at its proving time, a crashed proof has none
  // so the trace runs to the latest of its partial phase ends and any node's crash moment.
  const timelineEndSec = useMemo(() => {
    const ends = block.nodes.flatMap(node => {
      const phaseEnds = registry.list.map(p => windowSeconds(node.phases[p.index] ?? null)?.end ?? 0);
      return [...phaseEnds, node.crashed_ms != null ? msToSec(node.crashed_ms) : 0];
    });
    const maxEnd = ends.length ? Math.max(0, ...ends) : 0;
    return provingSec ?? (maxEnd > 0 ? maxEnd : 1);
  }, [block, registry, provingSec]);
  // Whether the proof has anything to plot, a phase window on some node or a crash marker.
  const hasTimeline = useMemo(
    () => block.nodes.some(node => node.crashed_ms != null || node.phases.some(p => p != null)),
    [block]
  );

  // Telemetry origin is the block start as an offset from the run epoch, so the x-axis reads as seconds
  // since proving start, and the window spans the trace with a one-second pad on each side.
  const origin = block.start_ms;
  const windowSec = useMemo<[number, number]>(() => [-1, timelineEndSec + 1], [timelineEndSec]);
  const bandsByNode = useMemo(() => phaseBands(block, nodes, registry), [block, nodes, registry]);

  return (
    <DetailPanel
      onClose={onClose}
      closeLabel="Close proof detail"
      aside={
        block.status !== 'success' ? (
          <span className={cx('text-sm font-semibold', statusColor(block.status))}>{statusLabel(block.status)}</span>
        ) : null
      }
    >
      <StatStrip items={proofOverviewFields().map(f => ({ label: f.label, value: f.render(block, registry) }))} />

      <ChartSection
        title="Trace"
        subtitle={
          block.status === 'success'
            ? undefined
            : 'This proof did not complete. The bars show how far each node reached, and a marker shows where a node crashed.'
        }
      >
        <ChartCard>
          {hasTimeline ? (
            <Gantt block={block} nodes={nodes} registry={registry} />
          ) : (
            <EmptyState tone="warning" as="div" className="flex h-24 items-center justify-center">
              This proof {statusLabel(block.status)} before any node reported progress, so no timeline is available.
            </EmptyState>
          )}
        </ChartCard>
      </ChartSection>

      <ChartSection
        title="GPU telemetry"
        subtitle="Seconds since proving start. The shaded band marks the proof window. Select a single node to overlay its phases."
      >
        <GpuTelemetry
          telemetry={telemetryById}
          metricDefs={run.telemetry.metrics}
          nodes={nodes}
          origin={origin}
          windowSec={windowSec}
          phaseBandsByNode={bandsByNode}
          highlight={provingSec != null ? [0, provingSec] : undefined}
          zoomable={false}
          group="proof-window"
        />
      </ChartSection>
    </DetailPanel>
  );
}
