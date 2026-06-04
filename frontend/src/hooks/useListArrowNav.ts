/*
 * Arrow-key stepping over a displayed list for a master-detail view. The open item is located by a
 * string key rather than object identity, so the stepping list can be the filtered-and-sorted set the
 * reader actually sees even when it differs in shape or run from the set the open item was resolved
 * against. Each item builds its own destination path, so a list that spans runs navigates each row to
 * its own run rather than forcing them all onto the open item's run.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunSearch } from '@/hooks/useRunSearch';

export function useListArrowNav<U>(params: {
  // Whether a detail is open, which gates the key listener.
  enabled: boolean;
  // The open item's key, matched against keyOf to place the cursor in the list.
  currentKey: string | undefined;
  // The displayed items in shown order, the set the arrow keys step through.
  items: U[];
  // Stable string key of an item, in the same form as currentKey.
  keyOf: (item: U) => string;
  // The destination pathname for an item, already encoded, that the arrow keys navigate to.
  pathOf: (item: U) => string;
}): void {
  const { enabled, currentKey, items, keyOf, pathOf } = params;
  const navigate = useNavigate();
  const search = useRunSearch();

  // Step the open item with the arrow keys, ignored while a form control holds focus. The cursor is
  // found by key, so stepping follows the displayed set. An open item the view does not show simply
  // does not step rather than jumping somewhere unseen.
  useEffect(() => {
    if (!enabled || currentKey == null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]')) return;
      const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (delta === 0) return;
      const idx = items.findIndex(item => keyOf(item) === currentKey);
      if (idx < 0) return;
      const next = items[idx + delta];
      if (next) {
        e.preventDefault();
        navigate({ pathname: pathOf(next), search }, { replace: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, currentKey, items, keyOf, pathOf, navigate, search]);
}
