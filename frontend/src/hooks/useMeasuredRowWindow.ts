/*
 * Variable-height windowing for a long, scrollable list. A fixed-height windower can map a scroll
 * offset to a row by division, but a list whose rows wrap to differing heights cannot. This hook tracks
 * each row's real height, every entry starting at a single-line estimate until the rendered row reports
 * its measured height, and serves the windowing math from those heights so only the on-screen slice
 * renders even when individual rows grow tall.
 *
 * A Fenwick (binary indexed) tree over the heights answers the two windowing questions in logarithmic
 * time, the cumulative offset of a row and the inverse lookup of which row sits at a pixel offset, and
 * absorbs a measured height as an O(log n) point update rather than a full re-sum. This keeps a list of
 * tens of thousands of rows responsive while every visible row carries its true wrapped height.
 */

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { RefObject } from 'react';

// Rows kept rendered above and below the viewport so a fast scroll never exposes an unpainted gap.
const OVERSCAN = 20;

// The smallest width change, in pixels, that counts as a genuine rewrap. It sits above a typical
// scrollbar width so a scrollbar toggling its space, around 15px, never resets the measured heights,
// while a real container resize still does.
const WIDTH_REWRAP_THRESHOLD = 24;

// A Fenwick tree over per-row heights. Index space is 0-based over `count` rows while the tree itself
// is the standard 1-based array. The heights buffer holds each row's live height so an update applies
// the delta against the prior value, and the tree answers prefix sums and the offset-to-index inverse.
export type RowMetrics = {
  // Records a row's height, returning whether it changed the stored value, so the caller re-renders
  // only when a measurement actually moves an offset.
  setHeight: (index: number, height: number) => boolean;
  // The cumulative height of rows before `index`, the pixel offset of that row's top.
  offsetOf: (index: number) => number;
  // The total height of all rows, the scrollable content height.
  total: () => number;
  // The largest index whose top offset is at or before `offset`, the row the pixel falls in.
  indexAt: (offset: number) => number;
};

export function createRowMetrics(count: number, estimate: number): RowMetrics {
  const heights = new Float64Array(count).fill(estimate);
  const tree = new Float64Array(count + 1);
  const add = (index: number, delta: number): void => {
    for (let k = index + 1; k <= count; k += k & -k) tree[k]! += delta;
  };
  for (let i = 0; i < count; i += 1) add(i, estimate);

  // Sum of the first `index` heights, clamped so a stale index left over from a shrunk list reads a
  // valid bound instead of running off the tree.
  const offsetOf = (index: number): number => {
    let i = Math.max(0, Math.min(index, count));
    let sum = 0;
    while (i > 0) {
      sum += tree[i]!;
      i -= i & -i;
    }
    return sum;
  };

  // The row containing a pixel offset, found by binary lifting over the tree so the lookup stays
  // O(log n). `pos` walks down the largest power-of-two steps whose partial sums still fit under the
  // offset, landing on the count of rows whose cumulative height is at or below it.
  const indexAt = (offset: number): number => {
    let pos = 0;
    let remaining = offset;
    let step = 1;
    while (step << 1 <= count) step <<= 1;
    for (; step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= count && tree[next]! <= remaining) {
        remaining -= tree[next]!;
        pos = next;
      }
    }
    return Math.min(pos, count);
  };

  const setHeight = (index: number, height: number): boolean => {
    if (index < 0 || index >= count) return false;
    const delta = height - heights[index]!;
    if (delta === 0) return false;
    heights[index] = height;
    add(index, delta);
    return true;
  };

  return { setHeight, offsetOf, total: () => offsetOf(count), indexAt };
}

// The on-screen slice and its surrounding spacers for a variable-height list. `scrollRef` is the
// scroll container and `innerRef` wraps the rendered rows, each carrying a `data-measured-row` index so
// its height can be read back. `estimate` is the height of a single unwrapped row, and `resetKey`
// rebuilds the height cache when row content geometry changes, such as a container width that rewraps
// every row.
export function useMeasuredRowWindow({
  scrollRef,
  innerRef,
  count,
  estimate,
  resetKey,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  innerRef: RefObject<HTMLDivElement | null>;
  count: number;
  estimate: number;
  resetKey: string;
}): { start: number; end: number; padTop: number; padBottom: number } {
  // The container width folds into the reset signature so a genuine rewrap discards stale measured
  // heights. The key only advances when the width moves more than a scrollbar's worth, the threshold
  // below, so a vertical scrollbar appearing or disappearing does not throw away every measured height
  // and collapse the list back to estimates, while a real container resize still resets the cache.
  const [widthKey, setWidthKey] = useState(0);
  const lastWidthRef = useRef<number | null>(null);
  const signature = `${count}:${estimate}:${resetKey}:${widthKey}`;

  // The metrics persist across renders for a given signature and rebuild when it changes, discarding
  // measured heights that a rewrap or a new filter has invalidated. The rebuild runs in the render that
  // changed the signature, the documented pattern for deriving state from prior renders, so no ref is
  // read or written during render and React keeps the same instance while the signature holds.
  const [cache, setCache] = useState(() => ({ signature, metrics: createRowMetrics(count, estimate) }));
  let metrics = cache.metrics;
  if (cache.signature !== signature) {
    metrics = createRowMetrics(count, estimate);
    setCache({ signature, metrics });
  }

  const [range, setRange] = useState({ start: 0, end: Math.min(count, 80) });
  const [, bump] = useReducer((n: number) => n + 1, 0);

  // Derives the visible slice from the current scroll position and the measured heights. Setting the
  // same bounds returns the prior object so React bails out of a no-op render.
  const recompute = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const viewport = el.clientHeight;
    const start = Math.max(0, metrics.indexAt(top) - OVERSCAN);
    const end = Math.min(count, metrics.indexAt(top + viewport) + 1 + OVERSCAN);
    setRange(prev => (prev.start === start && prev.end === Math.max(start, end) ? prev : { start, end: Math.max(start, end) }));
  }, [scrollRef, count, metrics]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => recompute();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      const last = lastWidthRef.current;
      // The first observed width records a baseline without advancing the key, so the first-paint
      // measured heights survive rather than being discarded the moment the observer fires. A later
      // change exceeding the threshold rewraps rows, so the width key advances and the cache resets.
      // Smaller deltas, such as a scrollbar toggling, leave measured heights intact.
      if (last === null) {
        lastWidthRef.current = width;
      } else if (Math.abs(width - last) > WIDTH_REWRAP_THRESHOLD) {
        lastWidthRef.current = width;
        setWidthKey(width);
      }
      recompute();
    });
    observer.observe(el);
    recompute();
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [recompute, scrollRef]);

  // A rebuilt metrics instance resets the cache to estimates, so the window is recomputed and the
  // now-visible rows are re-measured. `recompute` changes identity with the instance, driving this.
  useLayoutEffect(() => recompute(), [recompute]);

  // After each render, read back every rendered row's height. A changed height shifts offsets, so the
  // window is recomputed and a re-render is forced to repaint the spacers. Heights settle on the next
  // pass because a re-measured row reports the same height, leaving nothing changed.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    let changed = false;
    inner.querySelectorAll<HTMLElement>('[data-measured-row]').forEach(row => {
      const index = Number(row.dataset.measuredRow);
      if (metrics.setHeight(index, row.offsetHeight)) changed = true;
    });
    if (changed) {
      recompute();
      bump();
    }
  });

  const start = Math.min(range.start, count);
  const end = Math.min(range.end, count);
  const total = metrics.total();
  return {
    start,
    end,
    padTop: metrics.offsetOf(start),
    padBottom: Math.max(0, total - metrics.offsetOf(end)),
  };
}
