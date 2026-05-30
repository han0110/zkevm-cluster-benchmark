/*
 * Row windowing for the shared DataTable. Renders only the slice near the viewport plus an overscan so
 * opening a detail or scrolling stays cheap at any row count. Below a threshold it disables itself,
 * rendering a short table in full so the small per-node and hardware tables stay byte-identical. Row
 * height is measured from a rendered row and assumed uniform, which holds for single-line cells, and the
 * viewport is seeded with the window height so the first paint is already windowed.
 */

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export interface RowWindow {
  // Whether windowing is active. When false the caller renders every row, as a short table always does.
  enabled: boolean;
  // Half-open range of row indices to render.
  start: number;
  end: number;
  // Spacer heights in px standing in for the rows above and below the rendered slice.
  padTop: number;
  padBottom: number;
}

const seedViewport = (): number => (typeof window !== 'undefined' ? window.innerHeight : 800);

export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  total: number,
  threshold = 60,
  overscan = 12
): RowWindow {
  const enabled = total > threshold;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(seedViewport);
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

  if (!enabled) {
    return { enabled, start: 0, end: total, padTop: 0, padBottom: 0 };
  }
  const start = Math.max(0, Math.floor((scrollTop - headHeight) / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewport - headHeight) / rowHeight) + overscan);
  return { enabled, start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight };
}
