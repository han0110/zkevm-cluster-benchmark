/*
 * In-browser reader for a block's per-block log archive. The parse-benchmark tool emits each block's
 * log lines as JSON, and a local pack step compresses every JSON into its own gzipped tar holding a
 * single member, fetched and untarred here on demand so the bulky DEBUG-level logs never weigh down
 * benchmark.json. The archive is produced with GNU tar in ustar format, so a minimal reader recovers
 * the first regular-file member without a full tar library.
 */

import { gunzipSync } from 'fflate';
import type { LogEntry } from '@/types/benchmark';

// A tar header block is 512 bytes, and a file's data is padded to the next 512-byte boundary.
const BLOCK = 512;

// Reads a NUL- or space-terminated octal field, the encoding tar uses for the member size.
function readOctal(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let i = offset; i < offset + length; i += 1) {
    const c = bytes[i] ?? 0;
    if (c === 0 || c === 0x20) break;
    if (c < 0x30 || c > 0x37) continue;
    value = value * 8 + (c - 0x30);
  }
  return value;
}

// Whether a 512-byte block is entirely zero, the end-of-archive marker tar writes.
function isZeroBlock(bytes: Uint8Array, offset: number): boolean {
  for (let i = offset; i < offset + BLOCK; i += 1) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

// Whether a buffer is a ustar tar, identified by the "ustar" magic at offset 257 of the first header.
// A non-archive response, such as a dev server's HTML fallback for a missing file, fails this.
function isUstar(tar: Uint8Array): boolean {
  if (tar.length < 263) return false;
  return String.fromCharCode(tar[257]!, tar[258]!, tar[259]!, tar[260]!, tar[261]!) === 'ustar';
}

// Returns the bytes of the first regular-file member in a tar buffer, skipping any extended headers a
// tar implementation might prepend. Throws when the archive holds no regular file.
function firstFileBytes(tar: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset + BLOCK <= tar.length && !isZeroBlock(tar, offset)) {
    const size = readOctal(tar, offset + 124, 12);
    const typeFlag = tar[offset + 156];
    const dataStart = offset + BLOCK;
    // Type '0' (0x30) and the legacy NUL both denote a regular file. Anything else is an extended
    // header whose data is skipped so the next member is read.
    if (typeFlag === 0x30 || typeFlag === 0) {
      return tar.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error('archive holds no regular file member');
}

// Decompresses a block's gzipped-tar log archive and parses its single JSON member into log entries.
// The bytes are gunzipped only when they still carry the gzip magic number, since a transport that
// already inflated them, such as a dev server serving the .gz with Content-Encoding: gzip, leaves the
// bare tar. Bytes that are not a tar archive return null, marking the logs absent. A valid archive whose
// member is an empty array stays an empty log, distinct from that absent case.
export function decodeLogArchive(buffer: ArrayBuffer): LogEntry[] | null {
  const bytes = new Uint8Array(buffer);
  const tar = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  if (!isUstar(tar)) return null;
  const json = new TextDecoder().decode(firstFileBytes(tar));
  return JSON.parse(json) as LogEntry[];
}
