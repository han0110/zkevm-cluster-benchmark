import { describe, it, expect } from 'vitest';
import { fixture } from '@/test/fixture';
import { latestRun, runByIndex } from '@/utils/runs';
import type { Benchmark } from '@/types/benchmark';

describe('runByIndex', () => {
  it('resolves a run by its path-token index and rejects an absent or out-of-range token', () => {
    expect(runByIndex(fixture, '0')).toBe(fixture.runs[0]);
    expect(runByIndex(fixture, '1')).toBe(fixture.runs[1]);
    expect(runByIndex(fixture, '2')).toBeUndefined();
    expect(runByIndex(fixture, '-1')).toBeUndefined();
    expect(runByIndex(fixture, 'x')).toBeUndefined();
    expect(runByIndex(fixture, undefined)).toBeUndefined();
  });
});

describe('latestRun', () => {
  it('selects the run with the latest start, not the last in the array', () => {
    // The fixture appends the newer run last, so latestRun returns it.
    expect(latestRun(fixture)).toBe(fixture.runs[1]);
    // Reordering so the newer run comes first must not change the result, since selection is by start
    // time not position.
    const reordered: Benchmark = { ...fixture, runs: [fixture.runs[1]!, fixture.runs[0]!] };
    expect(latestRun(reordered)).toBe(fixture.runs[1]);
  });
});
