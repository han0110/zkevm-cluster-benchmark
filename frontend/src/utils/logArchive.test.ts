import { describe, it, expect } from 'vitest';
import { gzipSync } from 'fflate';
import { decodeLogArchive } from '@/utils/logArchive';
import type { LogEntry } from '@/types/benchmark';

// Builds a single-member ustar tar the way GNU tar --format=ustar does, enough for the reader, namely a
// name, an octal size, the regular-file type flag, the data padded to a 512-byte boundary, and the
// trailing zero blocks. The checksum field is left blank because the reader does not verify it.
function buildTar(content: Uint8Array, name = 'log.json'): Uint8Array {
  const enc = new TextEncoder();
  const header = new Uint8Array(512);
  header.set(enc.encode(name), 0);
  header.set(enc.encode(content.length.toString(8).padStart(11, '0')), 124);
  header[135] = 0x20; // size field terminator
  for (let i = 148; i < 156; i += 1) header[i] = 0x20; // blank checksum
  header[156] = 0x30; // '0', a regular file
  header.set(enc.encode('ustar\0'), 257); // ustar magic
  header.set(enc.encode('00'), 263); // ustar version
  const padded = Math.ceil(content.length / 512) * 512;
  const tar = new Uint8Array(512 + padded + 1024); // header + data + two zero end blocks
  tar.set(header, 0);
  tar.set(content, 512);
  return tar;
}

function archiveOf(entries: LogEntry[]): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(entries));
  const gz = gzipSync(buildTar(json));
  return new Uint8Array(gz).buffer;
}

describe('decodeLogArchive', () => {
  const entries: LogEntry[] = [
    { role: 'coordinator', time: 0, level: 'info', msg: 'job started' },
    { role: 'worker1', time: 1200, level: 'debug', msg: 'received' },
    { role: 'worker2', time: 3400, level: 'warn', msg: 'slow node' },
  ];

  it('gunzips and untars the single JSON member back into log entries', () => {
    expect(decodeLogArchive(archiveOf(entries))).toEqual(entries);
  });

  it('round-trips an empty log array', () => {
    expect(decodeLogArchive(archiveOf([]))).toEqual([]);
  });

  it('reads an already-inflated tar, the way a gzip Content-Encoding transport delivers it', () => {
    const json = new TextEncoder().encode(JSON.stringify(entries));
    expect(decodeLogArchive(new Uint8Array(buildTar(json)).buffer)).toEqual(entries);
  });

  it('returns null for a non-archive response such as an HTML fallback or an unbundled archive', () => {
    const html = new TextEncoder().encode('<!doctype html><html><body>not found</body></html>');
    expect(decodeLogArchive(new Uint8Array(html).buffer)).toBeNull();
  });

  it('round-trips a large multi-block-sized log without truncation', () => {
    const many: LogEntry[] = Array.from({ length: 4000 }, (_, i) => ({
      role: i % 2 ? 'worker1' : 'coordinator',
      time: i * 7,
      level: 'debug',
      msg: `line ${i} received frame`,
    }));
    const decoded = decodeLogArchive(archiveOf(many));
    expect(decoded).toHaveLength(4000);
    expect(decoded![3999]).toEqual(many[3999]);
  });

  it('skips a leading extended header and reads the following regular-file member', () => {
    const enc = new TextEncoder();
    // A pax extended header (type 'x', 0x78) carrying a one-block payload, then the real member after it.
    const ext = new Uint8Array(512);
    ext.set(enc.encode('pax_global_header'), 0);
    ext.set(enc.encode((20).toString(8).padStart(11, '0')), 124);
    ext[135] = 0x20;
    ext[156] = 0x78; // 'x', an extended header, not a regular file
    ext.set(enc.encode('ustar\0'), 257);
    ext.set(enc.encode('00'), 263);
    const member = buildTar(enc.encode(JSON.stringify(entries)));
    const tar = new Uint8Array(512 + 512 + member.length); // header + its padded payload + the member
    tar.set(ext, 0);
    tar.set(member, 1024);
    const gz = gzipSync(tar);
    expect(decodeLogArchive(new Uint8Array(gz).buffer)).toEqual(entries);
  });

  it('throws on a corrupt gzip body so the caller can surface the failure', () => {
    const garbage = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => decodeLogArchive(new Uint8Array(garbage).buffer)).toThrow();
  });

  it('throws when the archived member is not valid JSON', () => {
    const tar = buildTar(new TextEncoder().encode('this is not json'));
    expect(() => decodeLogArchive(new Uint8Array(tar).buffer)).toThrow();
  });
});
