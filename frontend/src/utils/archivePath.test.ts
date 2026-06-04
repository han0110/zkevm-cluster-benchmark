import { describe, it, expect } from 'vitest';
import { blockArchivePath } from '@/utils/archivePath';

describe('blockArchivePath', () => {
  it('keeps a single-segment name as one round-trippable segment', () => {
    const name = 'rpc_block_24949867';
    const segments = blockArchivePath(name).split('/');
    expect(segments).toHaveLength(1);
    expect(segments.map(decodeURIComponent)).toEqual([name]);
  });

  it('splits an EEST id on its separator and round-trips each segment through encoding', () => {
    const name = 'tests/zkevm/test_block.py::test_call[fork_Prague-state_test]';
    const original = name.split('::');
    const segments = blockArchivePath(name).split('/');
    expect(segments).toHaveLength(original.length);
    expect(segments.map(decodeURIComponent)).toEqual(original);
  });
});
