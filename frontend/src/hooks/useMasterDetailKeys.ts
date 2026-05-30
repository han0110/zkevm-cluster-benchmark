/*
 * Shared master-detail keyboard and routing glue. Redirects to the base path when the URL item is stale
 * and steps the open item with the arrow keys, both preserving the active benchmark. The page builds the
 * whole detail path because it can carry more than one segment (a run id and a node id).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunSearch } from '@/hooks/useRunSearch';

export function useMasterDetailKeys<T>(params: {
  // The open item, or null when none is open or the URL names a stale one.
  selected: T | null;
  // Whether the URL carries an item param at all, which gates the stale redirect.
  hasParam: boolean;
  // The list path the close and stale redirects return to.
  basePath: string;
  // The ordered items the arrow keys step through.
  items: T[];
  // The full detail pathname for an item, already encoded, that the arrow keys navigate to.
  pathOf: (item: T) => string;
}): void {
  const { selected, hasParam, basePath, items, pathOf } = params;
  const navigate = useNavigate();
  const search = useRunSearch();

  // A path naming an item that no longer exists falls back to the closed list rather than a blank panel.
  useEffect(() => {
    if (hasParam && !selected) navigate({ pathname: basePath, search }, { replace: true });
  }, [hasParam, selected, basePath, navigate, search]);

  // Step the open item with the arrow keys, ignored while a form control holds focus.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]')) return;
      const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (delta === 0) return;
      const next = items[items.indexOf(selected) + delta];
      if (next) {
        e.preventDefault();
        navigate({ pathname: pathOf(next), search }, { replace: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, items, pathOf, navigate, search]);
}
