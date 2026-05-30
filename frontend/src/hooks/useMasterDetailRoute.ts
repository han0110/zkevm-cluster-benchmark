/*
 * Shared master-detail routing scaffold for the Proofs and Metrics pages, resolving a run and open item
 * from the URL and returning the pieces both assemble into a table-and-detail split. The pages differ
 * only in item type, ordering, path naming, and base path. Keyboard and stale-item glue is in
 * useMasterDetailKeys.
 */

import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useRunSearch } from '@/hooks/useRunSearch';
import { useMasterDetailKeys } from '@/hooks/useMasterDetailKeys';
import { runByIndex } from '@/utils/runs';
import type { Benchmark, Run } from '@/types/benchmark';

interface MasterDetailRoute<T> {
  // The run named by the URL index, or null when the benchmark holds no run there.
  run: Run | null;
  // The run's display index within the benchmark, or -1 when no run is resolved.
  runIndex: number;
  // The open item, or null when none is open or the URL names a stale one.
  selected: T | null;
  // The active benchmark as a query string, for the close link that keeps it across the navigation.
  search: string;
  // The row key the table highlights for the open item, or undefined when none is open.
  activeKey: string | undefined;
  // The list path the close control returns to, with the active benchmark preserved.
  onClose: () => void;
}

// Resolves the run and open item, wiring arrow-key stepping and the stale-item redirect. The page passes
// the URL item token, the ordered items, a function naming an item in the path, and its base path.
export function useMasterDetailRoute<T>(params: {
  // Path segment naming the open item, undefined when the URL carries none.
  itemParam: string | undefined;
  // Ordered items the arrow keys step through, also the set the open item is matched against.
  items: T[];
  // Stable identity of an item, matched against the URL token and used to build the path and row key.
  idOf: (item: T) => string;
  // List path the close and stale redirects return to.
  basePath: string;
}): MasterDetailRoute<T> {
  const { itemParam, items, idOf, basePath } = params;
  const bench: Benchmark = useBench();
  const { runIdx } = useParams();
  const navigate = useNavigate();
  const search = useRunSearch();

  const run = runByIndex(bench, runIdx) ?? null;
  const runIndex = run ? bench.runs.indexOf(run) : -1;
  const selected = useMemo(
    () => (run && itemParam != null ? items.find(item => idOf(item) === itemParam) ?? null : null),
    [run, itemParam, items, idOf]
  );

  const pathOf = useMemo(
    () => (item: T) => (run ? `${basePath}/${runIndex}/${encodeURIComponent(idOf(item))}` : basePath),
    [run, runIndex, basePath, idOf]
  );

  useMasterDetailKeys({ selected, hasParam: itemParam != null, basePath, items, pathOf });

  const activeKey = run && selected ? `${runIndex}/${idOf(selected)}` : undefined;
  const onClose = useCallback(() => navigate({ pathname: basePath, search }), [navigate, basePath, search]);

  return { run, runIndex, selected, search, activeKey, onClose };
}
