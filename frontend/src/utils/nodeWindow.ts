/*
 * Bridges the node detail panel's two axes, the phase-timing block-index axis and the GPU telemetry
 * seconds axis. The shared zoom window is held canonically in seconds, node-independent because every
 * node shares one run epoch and length, so it survives a node switch unchanged. Each chart converts
 * seconds to its own axis and a zoom converts back, so the two always frame the same span.
 *
 * Untimed blocks stay correct. A crashed proof reports a zero window out of time order, so a naive
 * positional lookup collapses or inverts the window. Raw windows fold into monotonic non-decreasing
 * start/end anchors, placing an untimed block at its neighbours' running position not zero, then map
 * through them with binary search so the bridge is always ordered and never degenerate.
 */

// Monotonic non-decreasing per-block start/end anchors in seconds, one per block in array order. A timed
// block keeps its window clamped up to the running position, an untimed block (crashed proof, zero pair)
// is anchored to the running position so it sits between neighbours instead of jumping to the run origin.
export interface BlockAnchors {
  lo: number[];
  hi: number[];
}

export function monotonicBlockAnchors(blockWindows: ReadonlyArray<readonly [number, number]>): BlockAnchors {
  const n = blockWindows.length;
  const lo = new Array<number>(n);
  const hi = new Array<number>(n);
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const win = blockWindows[i];
    const s = win ? win[0] : 0;
    const e = win ? win[1] : 0;
    // A crashed proof arrives as a zero pair, so a positive end marks a real time.
    const timed = e > 0;
    const start = timed ? Math.max(cursor, s) : cursor;
    const end = timed ? Math.max(start, e) : cursor;
    lo[i] = start;
    hi[i] = end;
    cursor = end;
  }
  return { lo, hi };
}

// Smallest index whose value is at least the target in a non-decreasing array. Returns the last index
// when every value is below the target so a lookup never runs off the end.
function firstAtLeast(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    // mid is always in range, so the fallback only satisfies the index type and never fires.
    if ((arr[mid] ?? Infinity) >= target) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

// Largest index whose value is at most the target in a non-decreasing array. Returns index zero when
// every value is above the target so a lookup never falls below the start.
function lastAtMost(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    // mid is always in range, so the fallback only satisfies the index type and never fires.
    if ((arr[mid] ?? -Infinity) <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

// Seconds-to-axis bridge for one focused node, built once per node from its raw per-block windows and
// run length. Every method is pure and cheap (a binary search or one ratio) so a wheel runs it per tick
// without rebuilding anything.
export interface NodeWindowMap {
  // Run length in seconds, the right edge of the full window.
  runEndSec: number;
  // Last block index, the right edge of the phase category axis.
  last: number;
  // Full window in seconds, the panel default and the target a node switch preserves toward.
  full: [number, number];
  // A seconds window as a percent of the telemetry axis, exact and linear.
  telPct(windowSec: readonly [number, number]): [number, number];
  // A telemetry zoom in percent back to a seconds window.
  fromTelPct(start: number, end: number): [number, number];
  // A seconds window as a percent of the phase category axis, the index range whose anchors cover it.
  phasePct(windowSec: readonly [number, number]): [number, number];
  // A phase zoom in percent back to a seconds window, through the covered blocks' anchors.
  fromPhasePct(start: number, end: number): [number, number];
  // Monotonic seconds band for one block index, what a hover paints on the telemetry, or null when out
  // of range.
  blockBand(index: number): [number, number] | null;
}

export function createNodeWindowMap(
  blockWindows: ReadonlyArray<readonly [number, number]>,
  runEndSec: number
): NodeWindowMap {
  const { lo, hi } = monotonicBlockAnchors(blockWindows);
  const last = Math.max(0, blockWindows.length - 1);
  const e = runEndSec || 1;
  const clampPct = (v: number): number => Math.max(0, Math.min(100, v));
  const clampIdx = (i: number): number => Math.max(0, Math.min(last, i));

  return {
    runEndSec,
    last,
    full: [0, runEndSec],
    telPct: w => [clampPct((w[0] / e) * 100), clampPct((w[1] / e) * 100)],
    fromTelPct: (start, end) => {
      const a = Math.max(0, Math.min(runEndSec, (start / 100) * e));
      const b = Math.max(0, Math.min(runEndSec, (end / 100) * e));
      return a <= b ? [a, b] : [b, a];
    },
    phasePct: w => {
      if (last <= 0) return [0, 100];
      const a = clampIdx(firstAtLeast(hi, w[0]));
      const b = clampIdx(lastAtMost(lo, w[1]));
      const left = Math.min(a, b);
      const right = Math.max(a, b);
      return [(left / last) * 100, (right / last) * 100];
    },
    fromPhasePct: (start, end) => {
      if (last <= 0) return [0, runEndSec];
      const a = clampIdx(Math.round((start / 100) * last));
      const b = clampIdx(Math.round((end / 100) * last));
      const left = Math.min(a, b);
      const right = Math.max(a, b);
      const s = lo[left] ?? 0;
      const t = hi[right] ?? runEndSec;
      return s <= t ? [s, t] : [t, s];
    },
    blockBand: index => {
      if (index < 0 || index > last) return null;
      return [lo[index] ?? 0, hi[index] ?? 0];
    },
  };
}
