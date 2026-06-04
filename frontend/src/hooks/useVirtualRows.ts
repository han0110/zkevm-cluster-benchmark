/*
 * Row windowing for the shared DataTable. Renders only the slice near the viewport plus an overscan so
 * opening a detail or scrolling stays cheap at any row count. Below a threshold it disables itself,
 * rendering a short table in full so the small per-node and hardware tables stay byte-identical. Row
 * height is measured from a rendered row and assumed uniform, which holds for single-line cells, and the
 * viewport is seeded with the window height so the first paint is already windowed.
 */

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export interface RowWindow {
  // Whether windowing is active. When false the caller renders every row, as a short table always does.
  enabled: boolean;
  // Half-open range of row indices to render.
  start: number;
  end: number;
  // Spacer heights in px standing in for the rows above and below the rendered slice.
  padTop: number;
  padBottom: number;
  // Scrolls the container so the row at the given index clears the sticky header and the bottom edge,
  // a no-op when the row is already in view. The geometry forces an off-window row to render, since a
  // windowed row outside the slice has no element to scroll to.
  scrollToIndex: (index: number) => void;
}

export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  total: number,
  threshold = 60,
  overscan = 12
): RowWindow {
  const enabled = total > threshold;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(() => window.innerHeight);
  // Seed estimates so the first render is windowed, both corrected from the real geometry below.
  const [rowHeight, setRowHeight] = useState(37);
  const [headHeight, setHeadHeight] = useState(40);

  // Track the scroll offset and viewport height of the scroll container.
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => setScrollTop(el.scrollTop);
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    el.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(el);
    setScrollTop(el.scrollTop);
    setViewport(el.clientHeight);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [enabled, scrollRef]);

  // Measure the sticky header and a rendered row after layout, correcting the seeds so the window lines
  // up with real geometry. Runs on layout-changing inputs, not on every scroll.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!enabled || !el) return;
    const thead = el.querySelector('thead');
    if (thead instanceof HTMLElement && thead.offsetHeight > 0 && thead.offsetHeight !== headHeight) {
      setHeadHeight(thead.offsetHeight);
    }
    const row = el.querySelector('tbody tr[data-row]');
    if (row instanceof HTMLElement && row.offsetHeight > 0 && row.offsetHeight !== rowHeight) {
      setRowHeight(row.offsetHeight);
    }
  }, [enabled, scrollRef, viewport, total, rowHeight, headHeight]);

  // Brings a row into view from the live container geometry, nudging up when the sticky header would
  // cover it and down when it sits past the bottom edge. The header and row heights are measured from
  // the DOM at call time, not read from the seeded state, so a scroll issued before the first measure
  // still lands on the right row. The scroll position and viewport are read directly from the element.
  const scrollToIndex = useCallback(
    (index: number): void => {
      const el = scrollRef.current;
      if (!el) return;
      const thead = el.querySelector('thead');
      const row = el.querySelector('tbody tr[data-row]');
      const hh = thead instanceof HTMLElement && thead.offsetHeight > 0 ? thead.offsetHeight : headHeight;
      const rh = row instanceof HTMLElement && row.offsetHeight > 0 ? row.offsetHeight : rowHeight;
      const rowTop = hh + index * rh;
      if (rowTop - el.scrollTop < hh) {
        el.scrollTo({ top: rowTop - hh });
      } else if (rowTop + rh - el.scrollTop > el.clientHeight) {
        el.scrollTo({ top: rowTop + rh - el.clientHeight });
      }
    },
    [scrollRef, headHeight, rowHeight]
  );

  if (!enabled) {
    return { enabled, start: 0, end: total, padTop: 0, padBottom: 0, scrollToIndex };
  }
  const start = Math.max(0, Math.floor((scrollTop - headHeight) / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewport - headHeight) / rowHeight) + overscan);
  return { enabled, start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight, scrollToIndex };
}
