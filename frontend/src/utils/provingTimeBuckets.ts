/*
 * Fixed half-second bucketing of proving time shared by the histogram and phase breakdown, binning
 * successful proofs from zero to the slowest. Returns both per-bin counts and per-bin proof lists so the
 * bars and breakdown rows always describe the same blocks.
 */

import type { Block } from '@/types/benchmark';

export const BUCKET_S = 0.5;

export interface ProvingTimeBuckets {
  bucketS: number;
  // Lower-edge label per bin, so the run of labels reads as the proving-time axis.
  labels: string[];
  counts: number[];
  // Successful blocks grouped by their bin index, index-aligned with counts and labels.
  byBucket: Block[][];
}

export function provingTimeBuckets(blocks: Block[], bucketS = BUCKET_S): ProvingTimeBuckets {
  const success = blocks.filter(p => p.status === 'success');
  if (success.length === 0) return { bucketS, labels: [], counts: [], byBucket: [] };

  // Only successful proofs reach here so each carries a proving time, the fallback satisfies the type.
  const sec = (p: Block): number => (p.proving_ms ?? 0) / 1000;
  const nBuckets = Math.max(1, Math.ceil(Math.max(...success.map(sec)) / bucketS));
  const counts = Array.from({ length: nBuckets }, () => 0);
  const byBucket: Block[][] = Array.from({ length: nBuckets }, () => []);
  for (const p of success) {
    const i = Math.min(nBuckets - 1, Math.floor(sec(p) / bucketS));
    counts[i] = (counts[i] ?? 0) + 1;
    byBucket[i]?.push(p);
  }
  const labels = counts.map((_, i) => (i * bucketS).toFixed(1));
  return { bucketS, labels, counts, byBucket };
}

// Human-readable proving-time span of one bin, as "lo - hi s".
export function bucketRangeLabel(index: number, bucketS = BUCKET_S): string {
  return `${(index * bucketS).toFixed(1)} - ${((index + 1) * bucketS).toFixed(1)} s`;
}
