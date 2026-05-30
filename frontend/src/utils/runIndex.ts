/*
 * Manifest-free benchmark discovery via import.meta.glob over the data directory at build time. The ?url
 * query yields each served URL without loading its contents, so listing never parses the large payloads.
 * Each file is named for its unique benchmark id, so the id doubles as the URL selector.
 */

import type { RunIndexEntry } from '@/types/benchmark';

const modules = import.meta.glob('/data/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Returns the available benchmarks, derived from the data directory file names, ordered by id.
export function loadRunIndex(): RunIndexEntry[] {
  return Object.entries(modules)
    .map(([path, url]) => ({ id: path.replace(/^.*\//, '').replace(/\.json$/, ''), url }))
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
