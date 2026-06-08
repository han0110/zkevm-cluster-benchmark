import { describe, it, expect, vi } from 'vitest';

// hasLogArchive consults the build-time index the logArchiveIndex Vite plugin emits. The virtual module
// is mocked so the test pins exactly which archives the build is said to bundle, independent of the local
// data/log tree. The EEST entry is stored in the same flat percent-encoded form the plugin emits (the
// `::` flattened to `__`), so a true result also proves archiveRelPath maps a `::` id to that identical
// path.
vi.mock('virtual:log-archive-index', () => ({
  default: [
    'bench-1/run-1/rpc_block_42.tar.json',
    'eest/eest-run/test_stack.py__test_swap%5Bfork_Osaka-opcode_SWAP1-value_60M%5D.tar.json',
  ],
}));

import { hasLogArchive } from '@/utils/logArchiveIndex';

describe('hasLogArchive', () => {
  it('is true for a single-segment block whose archive the build bundled', () => {
    expect(hasLogArchive('bench-1', 'run-1', 'rpc_block_42')).toBe(true);
  });

  it('is true for an EEST id whose encoded archive path is in the index', () => {
    expect(
      hasLogArchive('eest', 'eest-run', 'test_stack.py::test_swap[fork_Osaka-opcode_SWAP1-value_60M]')
    ).toBe(true);
  });

  it('is false for a block the build did not bundle', () => {
    expect(hasLogArchive('bench-1', 'run-1', 'rpc_block_999')).toBe(false);
  });

  it('is false for a different run of an otherwise-present block', () => {
    expect(hasLogArchive('bench-1', 'run-2', 'rpc_block_42')).toBe(false);
  });
});
