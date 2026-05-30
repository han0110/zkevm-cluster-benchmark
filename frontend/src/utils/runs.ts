/*
 * Run selection within a loaded benchmark. A benchmark holds one or more runs, and views pick a run by
 * the URL id or, where none is named, by recency. A patch appends a run, so the newest run is the one
 * with the latest start not the last in the array.
 */

import type { Benchmark, Block, Run } from '@/types/benchmark';

// The run named by id, or undefined when the benchmark holds no run under that id.
export const runById = (bench: Benchmark, id: string | undefined): Run | undefined =>
  id == null ? undefined : bench.runs.find(r => r.id === id);

// The latest attempt at each block across every run, sorted by id, taking a multiply-proved block from
// the latest-started run so a patched benchmark reads as one merged result. The overview charts this
// whole-benchmark set because the newest run can be a small recovery patch.
export function latestBlocks(bench: Benchmark): Block[] {
  const latest = new Map<string, { block: Block; startedAt: number }>();
  for (const run of bench.runs) {
    for (const block of run.blocks) {
      const prev = latest.get(block.id);
      if (prev == null || run.started_at > prev.startedAt) {
        latest.set(block.id, { block, startedAt: run.started_at });
      }
    }
  }
  return [...latest.values()]
    .map(entry => entry.block)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// The run at the given index, the value the detail paths carry, or undefined when the segment is absent
// or out of range. The index is the run's position (the tables' run column), a short stable path token
// in place of the long run id.
export const runByIndex = (bench: Benchmark, idx: string | undefined): Run | undefined => {
  if (idx == null) return undefined;
  const i = Number(idx);
  return Number.isInteger(i) && i >= 0 && i < bench.runs.length ? bench.runs[i] : undefined;
};

// The most recent run by start time, the default when the URL names no run. Falls back to the first run
// if none carries a start so a benchmark with runs always resolves to one.
export function latestRun(bench: Benchmark): Run {
  return bench.runs.reduce((newest, run) => (run.started_at > newest.started_at ? run : newest), bench.runs[0]!);
}

// Display index of a run within its benchmark, the 'run' column value the tables show. Returns -1 when
// the run is not part of the benchmark.
export const runIndexOf = (bench: Benchmark, run: Run): number => bench.runs.indexOf(run);
