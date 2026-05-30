/*
 * Overview page stacking identity, statistics, proving-time distribution, phase breakdown, critical-path
 * phase timing, and the gas-vs-time scatter. Every per-block view reads the benchmark's merged latest
 * fixtures so a patched benchmark shows its whole result, not only the newest run.
 */

import { useMemo } from 'react';
import { useBench } from '@/hooks/useBench';
import { StatStrip, type StatItem } from '@/components/common/StatStrip';
import { HardwareTable } from '@/components/common/HardwareTable';
import { ChartCard } from '@/components/common/ChartCard';
import { ChartSection } from '@/components/common/ChartSection';
import { ScatterLine } from '@/components/charts/ScatterLine';
import { ProvingTimeHistogram } from '@/components/charts/ProvingTimeHistogram';
import { PhaseBreakdownChart, type PhaseBreakdownRow } from '@/components/charts/PhaseBreakdownChart';
import { PhaseTimingChart } from '@/components/charts/PhaseTimingChart';
import { clusterPhaseSeries, meanClusterPhases } from '@/utils/phaseTimings';
import { provingTimeBuckets, bucketRangeLabel } from '@/utils/provingTimeBuckets';
import { buildPhaseRegistry } from '@/utils/phases';
import { latestBlocks } from '@/utils/runs';
import { summarizeProofs } from '@/utils/proofStats';
import { formatCompact, formatMsSeconds, dash, formatDateTime } from '@/utils/format';

export function OverviewPage() {
  const data = useBench();
  const { software, hardware } = data;
  const registry = useMemo(() => buildPhaseRegistry(data), [data]);
  // The merged latest fixtures across every run, the set every per-block view and the headline stats
  // summarize, so the overview reflects the whole benchmark not a single run.
  const blocks = useMemo(() => latestBlocks(data), [data]);
  const summary = useMemo(() => summarizeProofs(blocks), [blocks]);
  // The benchmark started when its first run did, the earliest start across the runs.
  const startedAt = useMemo(() => Math.min(...data.runs.map(r => r.started_at)), [data]);

  const cluster = clusterPhaseSeries(blocks, registry);
  const buckets = provingTimeBuckets(blocks);

  // One breakdown row for every block, then one per non-empty proving-time bucket from fastest to slowest.
  const allBlocks: PhaseBreakdownRow = { label: 'All blocks', ...meanClusterPhases(blocks, registry) };
  const bucketRows: PhaseBreakdownRow[] = buckets.byBucket.flatMap((ps, i) =>
    ps.length ? [{ label: bucketRangeLabel(i, buckets.bucketS), ...meanClusterPhases(ps, registry) }] : []
  );
  // A blank zero-value row sets the All-blocks summary apart from the per-bucket rows below it.
  const spacer: PhaseBreakdownRow = { label: '', phases: allBlocks.phases.map(p => ({ ...p, seconds: 0 })), total: 0 };
  const phaseRows: PhaseBreakdownRow[] = bucketRows.length ? [allBlocks, spacer, ...bucketRows] : [allBlocks];

  const softwareItems: StatItem[] = [
    { label: 'zkVM', value: software.zkvm.name },
    { label: 'zkVM Version', value: software.zkvm.version },
    { label: 'Guest', value: software.guest.name },
    { label: 'Guest Version', value: software.guest.version },
  ];

  const failed = summary.count - summary.success;
  const stats: StatItem[] = [
    { label: 'Proofs', value: `${summary.success}/${summary.count}${failed ? ` (${failed} failed)` : ''}` },
    { label: 'Throughput', value: dash(summary.gasPerSecond, g => `${formatCompact(g)} gas/s`) },
    { label: 'Time (mean / median)', value: `${formatMsSeconds(summary.meanMs)} / ${formatMsSeconds(summary.p50Ms)}` },
    {
      label: 'Time (p90 / p95 / p99)',
      value: `${formatMsSeconds(summary.p90Ms)} / ${formatMsSeconds(summary.p95Ms)} / ${formatMsSeconds(summary.p99Ms)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ChartSection title="Hardware">
        <HardwareTable hardware={hardware} />
      </ChartSection>

      <ChartSection title="Software">
        <StatStrip items={softwareItems} />
      </ChartSection>

      <ChartSection title="Proof" subtitle={`Benchmark at ${benchmarkTime(startedAt)}`}>
        <StatStrip items={stats} />
      </ChartSection>

      <ChartSection title="Proving time distribution">
        <ChartCard>
          <ProvingTimeHistogram labels={buckets.labels} counts={buckets.counts} bucketS={buckets.bucketS} />
        </ChartCard>
      </ChartSection>

      <ChartSection title="Phase breakdown">
        <ChartCard>
          <PhaseBreakdownChart rows={phaseRows} registry={registry} />
        </ChartCard>
      </ChartSection>

      <ChartSection title="Phase breakdown per block" subtitle="Each phase ends when the last node finishes it.">
        <ChartCard>
          <PhaseTimingChart labels={cluster.labels} values={cluster.values} registry={registry} total={cluster.total} />
        </ChartCard>
      </ChartSection>

      <ChartSection title="Gas used vs proving time">
        <ChartCard>
          <ScatterLine blocks={blocks} cluster={cluster} registry={registry} height={300} />
        </ChartCard>
      </ChartSection>
    </div>
  );
}

// Benchmark start timestamp rendered as a date followed by the time, joined with a space.
const benchmarkTime = (ms: number): string =>
  formatDateTime(
    ms,
    { year: 'numeric', month: 'short', day: '2-digit' },
    { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
  );
