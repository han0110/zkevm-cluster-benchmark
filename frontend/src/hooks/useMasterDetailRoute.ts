/*
 * Shared master-detail routing scaffold for the Blocks and Metrics pages, resolving a run and open item
 * from the URL and returning the pieces both assemble into a table-and-detail split. The pages differ
 * only in item type, ordering, path naming, and base path. A stale URL item redirects back to the list.
 * Arrow-key stepping is separate, in useListArrowNav, because it follows the displayed set rather than
 * the resolution set and each page builds its own per-item path.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useRunSearch } from '@/hooks/useRunSearch';
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

// Resolves the run and open item and redirects a stale URL item back to the list. The page passes the
// URL item token, the set the open item is matched against, a function naming an item, and its base path.
export function useMasterDetailRoute<T>(params: {
  // Path segment naming the open item, undefined when the URL carries none.
  itemParam: string | undefined;
  // The set the open item is matched against, the whole run so an item the view filters out still
  // resolves and stays open rather than redirecting away.
  items: T[];
  // Stable identity of an item, matched against the URL token and used to build the active row key.
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

  // A path naming an item that no longer exists falls back to the closed list rather than a blank panel.
  useEffect(() => {
    if (itemParam != null && !selected) navigate({ pathname: basePath, search }, { replace: true });
  }, [itemParam, selected, basePath, navigate, search]);

  const activeKey = run && selected ? `${runIndex}/${idOf(selected)}` : undefined;
  const onClose = useCallback(() => navigate({ pathname: basePath, search }), [navigate, basePath, search]);

  // Escape closes the open detail. It rides on window, below the overlays that listen on document, and
  // skips when one of them already handled the key (an open fullscreen trace, filter, or selector) or
  // when a form control has focus, so it only closes the panel when nothing else claims the key.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  return { run, runIndex, selected, search, activeKey, onClose };
}
