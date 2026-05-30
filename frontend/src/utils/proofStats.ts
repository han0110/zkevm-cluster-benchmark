/*
 * Summary statistics over a set of proof blocks, the overview headline figures. Percentiles use the same
 * linear interpolation as the Rust parser so the values match its precomputed per-run statistics. A
 * merged latest set has no precomputed statistics, so it is summarized here on the fly.
 */

import type { Block } from '@/types/benchmark';

export interface ProofSummary {
  count: number;
  success: number;
  meanMs: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  gasPerSecond: number | null;
}

// The linear-interpolation percentile of an ascending-sorted array, rounded, matching the parser.
function percentile(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0]!;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac);
}

// Summarizes the proving-time distribution and gas throughput over the successful blocks of the set.
export function summarizeProofs(blocks: Block[]): ProofSummary {
  const ok = blocks.filter(b => b.status === 'success');
  const proving = ok.map(b => b.proving_ms).filter((m): m is number => m != null);
  const totalMs = proving.reduce((sum, m) => sum + m, 0);
  const sorted = [...proving].sort((a, b) => a - b);
  const totalGas = ok.reduce((sum, b) => sum + (b.gas_used ?? 0), 0);
  const totalSeconds = totalMs / 1000;
  return {
    count: blocks.length,
    success: ok.length,
    meanMs: proving.length ? Math.round(totalMs / proving.length) : null,
    p50Ms: percentile(sorted, 50),
    p90Ms: percentile(sorted, 90),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    gasPerSecond: totalSeconds > 0 ? Math.round(totalGas / totalSeconds) : null,
  };
}
