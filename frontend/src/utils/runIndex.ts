/*
 * Manifest-free benchmark discovery via import.meta.glob over the data directory at build time. Each
 * benchmark is a flat data/{id}.json document, so the glob lists the files and the basename is the
 * unique benchmark id. The ?url query yields each served URL without loading its contents, so listing
 * never parses the large payloads. The per-block log archives live under data/log and are fetched
 * separately on demand, so they are not part of this index.
 */

import type { RunIndexEntry } from '@/types/benchmark';

const modules = import.meta.glob('/data/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Returns the available benchmarks, derived from the data file basenames, ordered by id.
export function loadRunIndex(): RunIndexEntry[] {
  return Object.entries(modules)
    .map(([path, url]) => ({ id: path.replace(/^.*\/data\//, '').replace(/\.json$/, ''), url }))
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
