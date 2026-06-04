/*
 * Shared state for the Blocks view's filter row and its table. The filter controls live above the
 * master-detail split so opening a block never reflows them onto a second line, yet they and the table
 * read one filtered set, so this hook owns that set and the page hands each piece to its renderer.
 */

import { useEffect, useMemo, useState } from 'react';
import { buildPhaseRegistry, type PhaseRegistry } from '@/utils/phases';
import {
  blockBounds,
  buildBlockRows,
  defaultFilters,
  filterBlocks,
  type BlockBounds,
  type BlockFilters,
  type BlockRow,
} from '@/features/blocks/blockFilters';
import type { Benchmark, Block } from '@/types/benchmark';

export interface BlockTableModel {
  registry: PhaseRegistry;
  // Every block row across the runs, before filtering, the set the re-run all-selected check measures.
  allRows: BlockRow[];
  // The rows the filters currently show.
  rows: BlockRow[];
  // The slowest successful proof in milliseconds, the steady scale for the phase-mix bars.
  maxProvingMs: number;
  bounds: BlockBounds;
  filters: BlockFilters;
  setFilters: (next: BlockFilters) => void;
  // The blocks a re-run command targets, the shown set.
  reRunBlocks: Block[];
  // Whether the shown set already covers every block name, so the re-run drops its explicit list.
  allSelected: boolean;
}

export function useBlockTableModel(bench: Benchmark): BlockTableModel {
  const registry = useMemo(() => buildPhaseRegistry(bench), [bench]);
  const allRows = useMemo(() => buildBlockRows(bench), [bench]);

  const maxProvingMs = useMemo(
    () => allRows.reduce((m, r) => (r.block.proving_ms != null && r.block.proving_ms > m ? r.block.proving_ms : m), 0),
    [allRows]
  );

  const bounds = useMemo(
    () => blockBounds(allRows.map(r => r.block), bench.hardware.nodes.length),
    [allRows, bench.hardware.nodes.length]
  );
  const [filters, setFilters] = useState<BlockFilters>(() => defaultFilters(bounds));
  // Reset to the latest-attempt default when the bounds change with the benchmark.
  useEffect(() => setFilters(defaultFilters(bounds)), [bounds]);

  const rows = useMemo(() => filterBlocks(allRows, filters, bounds), [allRows, filters, bounds]);
  const reRunBlocks = useMemo(() => rows.map(r => r.block), [rows]);
  const allSelected = useMemo(() => {
    const shown = new Set(reRunBlocks.map(b => b.name));
    const all = new Set(allRows.map(r => r.block.name));
    return shown.size === all.size;
  }, [reRunBlocks, allRows]);

  return { registry, allRows, rows, maxProvingMs, bounds, filters, setFilters, reRunBlocks, allSelected };
}
