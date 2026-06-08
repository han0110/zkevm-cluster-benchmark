import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { gzipSync } from 'fflate';
import type { LogEntry } from '@/types/benchmark';

// The build-time index is mocked to bundle exactly one block, so the gate decides to fetch for that block
// and to report absence for any other without touching the network.
vi.mock('virtual:log-archive-index', () => ({
  default: ['b/r/present_block.tar.json'],
}));

import { useBlockLogs } from '@/features/blocks/useBlockLogs';

// Builds the single-member gzipped ustar tar the loader decodes, the same shape the parser writes: a
// header with a name, octal size, and regular-file flag, the data padded to a 512-byte boundary, then the
// trailing zero blocks, all gzipped.
function buildArchive(entries: LogEntry[]): ArrayBuffer {
  const content = new TextEncoder().encode(JSON.stringify(entries));
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  header.set(enc.encode('log.json'), 0);
  header.set(enc.encode(content.length.toString(8).padStart(11, '0')), 124);
  header[135] = 0x20;
  for (let i = 148; i < 156; i += 1) header[i] = 0x20;
  header[156] = 0x30;
  header.set(enc.encode('ustar\0'), 257);
  header.set(enc.encode('00'), 263);
  const padded = Math.ceil(content.length / 512) * 512;
  const tar = new Uint8Array(512 + padded + 1024);
  tar.set(header, 0);
  tar.set(content, 512);
  const gz = gzipSync(tar);
  return new Uint8Array(gz).buffer;
}

describe('useBlockLogs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports absent with no network request when the block is not in the build index', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useBlockLogs('b', 'r', 'absent_block'));
    await waitFor(() => expect(result.current.status).toBe('absent'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches a .tar.json archive and decodes its logs for an indexed block', async () => {
    const entries: LogEntry[] = [
      { role: 'coordinator', time: 0, level: 'info', msg: 'job started' },
      { role: 'worker1', time: 1200, level: 'debug', msg: 'received' },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(buildArchive(entries), { status: 200 }));
    const { result } = renderHook(() => useBlockLogs('b', 'r', 'present_block'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', logs: entries });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0]).endsWith('/data/log/b/r/present_block.tar.json')).toBe(true);
  });
});
