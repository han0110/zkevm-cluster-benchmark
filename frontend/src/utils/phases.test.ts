import { describe, it, expect } from 'vitest';
import { fixture } from '@/test/fixture';
import { buildPhaseRegistry } from '@/utils/phases';
import type { Benchmark } from '@/types/benchmark';

describe('buildPhaseRegistry aggregator derivation', () => {
  it('derives the aggregator-only phase and the scatter phase from the cluster shape', () => {
    const reg = buildPhaseRegistry(fixture);
    expect(reg.list.map(p => p.name)).toEqual(['input', 'emulation', 'commit', 'prove', 'aggregate']);
    // Only the aggregator node carries the final window, so 'aggregate' is present on some but not all
    // nodes, which is how it is identified.
    expect(reg.aggregatorPhase).toBe('aggregate');
    // The scatter color tracks the last non-aggregator phase.
    expect(reg.scatterPhase.name).toBe('prove');
  });

  it('searches every run for a clean block, not only the first run', () => {
    const crashed = fixture.runs[0]!.blocks.find(b => b.status === 'crashed')!;
    const clean = fixture.runs[0]!.blocks.find(b => b.name === '0001')!;
    // run0 holds only a crash here, so the aggregator can be read only from run1's clean block.
    const crossRun: Benchmark = {
      ...fixture,
      runs: [
        { ...fixture.runs[0]!, blocks: [crashed] },
        { ...fixture.runs[1]!, blocks: [clean] },
      ],
    };
    expect(buildPhaseRegistry(crossRun).aggregatorPhase).toBe('aggregate');
  });
});
