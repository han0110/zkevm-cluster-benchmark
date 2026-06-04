import { describe, it, expect } from 'vitest';
import { fixture } from '@/test/fixture';
import {
  buildBlockRows,
  defaultFilters,
  filterBlocks,
  fullFilters,
  participatingCount,
  blockBounds,
  BLOCK_PRESETS,
  type BlockRow,
} from '@/features/blocks/blockFilters';

const CLUSTER = fixture.hardware.nodes.length;

const rows = buildBlockRows(fixture);
const bounds = blockBounds(
  rows.map(r => r.block),
  CLUSTER
);

// A row by its block id and run index, the composite identity the table keys on.
const row = (id: string, runIndex: number): BlockRow => {
  const found = rows.find(r => r.block.name === id && r.runIndex === runIndex);
  if (!found) throw new Error(`no row ${id}@${runIndex}`);
  return found;
};

describe('buildBlockRows', () => {
  it('combines every run and flags only the latest attempt at each block', () => {
    // run0 holds 0001, 0002, and weird'id, while run1 re-runs 0002 and weird'id.
    expect(rows).toHaveLength(5);
    expect(row('0001', 0).isLatest).toBe(true);
    // run1 started later, so its attempts win and the run0 attempts are superseded.
    expect(row('0002', 0).isLatest).toBe(false);
    expect(row('0002', 1).isLatest).toBe(true);
    expect(row("weird'id", 0).isLatest).toBe(false);
    expect(row("weird'id", 1).isLatest).toBe(true);
  });
});

describe('blockBounds', () => {
  it('spans the observed proving seconds and offers the node range only below the full cluster', () => {
    expect(bounds.time).toEqual([5, 8]);
    expect(bounds.clusterSize).toBe(CLUSTER);
    // 0002 in run0 ran on two of three nodes, so the slider spans two up to the full cluster.
    expect(bounds.nodes).toEqual([2, CLUSTER]);
  });
});

describe('filterBlocks', () => {
  it('keeps only the latest attempt under the default filters', () => {
    const shown = filterBlocks(rows, defaultFilters(bounds), bounds);
    expect(shown.map(r => `${r.block.name}@${r.runIndex}`).sort()).toEqual(['0001@0', '0002@1', "weird'id@1"]);
  });

  it('treats the status set as a union so several outcomes stack', () => {
    const full = fullFilters(bounds);
    const crashed = filterBlocks(rows, { ...full, statuses: ['crashed'] }, bounds);
    expect(crashed.map(r => r.block.name)).toEqual(["weird'id"]);
    expect(crashed[0]!.runIndex).toBe(0);
    // The union of crashed and success is every row in the fixture.
    const both = filterBlocks(rows, { ...full, statuses: ['crashed', 'success'] }, bounds);
    expect(both).toHaveLength(rows.length);
  });

  it('filters by participating-node count, the missing-node span being one to cluster-1', () => {
    const full = fullFilters(bounds);
    const missing = filterBlocks(rows, { ...full, nodes: [1, CLUSTER - 1] }, bounds);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.block.name).toBe('0002');
    expect(missing[0]!.runIndex).toBe(0);
    expect(participatingCount(missing[0]!.block)).toBe(2);
  });
});

describe('BLOCK_PRESETS missing-nodes', () => {
  it('toggles the node range to the one-to-(n-1) span and lights up when it matches', () => {
    const preset = BLOCK_PRESETS.find(p => p.id === 'missing-nodes');
    if (!preset) throw new Error('missing-nodes preset');
    const full = fullFilters(bounds);
    expect(preset.isActive(full, bounds)).toBe(false);
    const applied = preset.toggle(full, bounds);
    expect(applied.nodes).toEqual([1, CLUSTER - 1]);
    expect(preset.isActive(applied, bounds)).toBe(true);
  });
});
