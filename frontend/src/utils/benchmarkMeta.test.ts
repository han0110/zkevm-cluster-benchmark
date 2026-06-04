import { describe, it, expect } from 'vitest';
import { parseBenchmarkHead } from '@/utils/benchmarkMeta';

// A compact head shaped like a real document, truncated partway through the first run as a ranged read
// returns it.
const head = (extra = '') =>
  `{"schema_version":1,"hardware":{"cpu_model":"AMD","ram_gib":125,"gpu_models":["RTX 5090"],"nodes":["node1"]},` +
  `"software":{"zkvm":{"name":"zisk","version":"v0.18.0","phases":[{"name":"input","label":"Input Transfer"}]},` +
  `"guest":{"name":"reth","version":"v2.1.0"}},"id":"eest-60m-20260603-002355","name":"eest-60m",` +
  `"description":"EEST blocks with 60M gas limit"${extra},"runs":[{"id":"eest-60m-20260603-002355","started_at":1748910235000,"block_count":1077`;

describe('parseBenchmarkHead', () => {
  it('extracts identity, software, and the first run start from a truncated head', () => {
    const meta = parseBenchmarkHead(head());
    expect(meta.id).toBe('eest-60m-20260603-002355');
    expect(meta.name).toBe('eest-60m');
    expect(meta.description).toBe('EEST blocks with 60M gas limit');
    expect(meta.software.zkvm.name).toBe('zisk');
    expect(meta.software.zkvm.version).toBe('v0.18.0');
    expect(meta.software.guest.name).toBe('reth');
    expect(meta.software.guest.version).toBe('v2.1.0');
    expect(meta.startedAt).toBe(1748910235000);
  });

  it('parses a complete body with an empty runs array, reporting no start', () => {
    const body =
      `{"schema_version":1,"hardware":{"cpu_model":null,"ram_gib":null,"gpu_models":[],"nodes":[]},` +
      `"software":{"zkvm":{"name":"zisk","version":"v0.18.0","phases":[]},"guest":{"name":"reth","version":"v2.1.0"}},` +
      `"id":"empty-bench","name":"empty","description":"no runs","runs":[]}`;
    const meta = parseBenchmarkHead(body);
    expect(meta.id).toBe('empty-bench');
    expect(meta.startedAt).toBeNull();
  });

  it('truncates at the runs boundary so a long runs payload never needs parsing', () => {
    // Trailing junk after the boundary stands in for the multi-megabyte runs array the reader never sees.
    const meta = parseBenchmarkHead(head() + ',{"id":"second-run","started_at":9}]}garbage-not-valid-json');
    // The first run's start wins, and the unparseable tail is ignored because the object closes at runs.
    expect(meta.startedAt).toBe(1748910235000);
    expect(meta.name).toBe('eest-60m');
  });

  it('parses a whitespace-formatted head, tolerating spacing around the runs key and colon', () => {
    // A pretty-printed document with newlines and spaces around every key, colon, and the runs boundary,
    // truncated partway through the first run as a ranged read returns it.
    const pretty =
      `{\n  "schema_version": 1,\n  "hardware": {"cpu_model": "AMD", "ram_gib": 125, "gpu_models": ["RTX 5090"], "nodes": ["node1"]},\n` +
      `  "software": {"zkvm": {"name": "zisk", "version": "v0.18.0", "phases": []}, "guest": {"name": "reth", "version": "v2.1.0"}},\n` +
      `  "id": "pretty-bench",\n  "name": "pretty",\n  "description": "whitespace formatted" ,\n` +
      `  "runs" : [\n    {"id": "pretty-bench", "started_at" : 1748910235000, "block_count": 1077`;
    const meta = parseBenchmarkHead(pretty);
    expect(meta.id).toBe('pretty-bench');
    expect(meta.name).toBe('pretty');
    expect(meta.description).toBe('whitespace formatted');
    expect(meta.software.zkvm.name).toBe('zisk');
    expect(meta.startedAt).toBe(1748910235000);
  });
});
