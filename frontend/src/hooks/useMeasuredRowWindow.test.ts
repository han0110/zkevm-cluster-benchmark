import { describe, it, expect } from 'vitest';
import { createRowMetrics } from '@/hooks/useMeasuredRowWindow';

describe('createRowMetrics', () => {
  it('treats every row as the estimate until measured', () => {
    const m = createRowMetrics(10, 28);
    expect(m.offsetOf(0)).toBe(0);
    expect(m.offsetOf(1)).toBe(28);
    expect(m.offsetOf(5)).toBe(140);
    expect(m.total()).toBe(280);
  });

  it('maps a pixel offset to the row it falls in, the row top inclusive', () => {
    const m = createRowMetrics(10, 28);
    // Row 0 spans [0, 28). A pixel at the next row's top belongs to that row.
    expect(m.indexAt(0)).toBe(0);
    expect(m.indexAt(27)).toBe(0);
    expect(m.indexAt(28)).toBe(1);
    expect(m.indexAt(140)).toBe(5);
  });

  it('clamps an offset past the end to the row count', () => {
    const m = createRowMetrics(10, 28);
    expect(m.indexAt(100000)).toBe(10);
  });

  it('shifts every later offset by a measured height and reports the change', () => {
    const m = createRowMetrics(10, 28);
    expect(m.setHeight(2, 100)).toBe(true);
    // Re-measuring the same height is a no-op so the caller does not re-render.
    expect(m.setHeight(2, 100)).toBe(false);
    // Offsets before the grown row are unchanged, and offsets after it absorb the +72.
    expect(m.offsetOf(2)).toBe(56);
    expect(m.offsetOf(3)).toBe(156);
    expect(m.total()).toBe(352);
    // The grown row spans [56, 156), and the inverse lookup reflects that.
    expect(m.indexAt(56)).toBe(2);
    expect(m.indexAt(155)).toBe(2);
    expect(m.indexAt(156)).toBe(3);
  });

  it('ignores a height for an out-of-range index', () => {
    const m = createRowMetrics(3, 28);
    expect(m.setHeight(-1, 50)).toBe(false);
    expect(m.setHeight(3, 50)).toBe(false);
    expect(m.total()).toBe(84);
  });

  it('handles an empty list', () => {
    const m = createRowMetrics(0, 28);
    expect(m.total()).toBe(0);
    expect(m.offsetOf(0)).toBe(0);
    expect(m.indexAt(0)).toBe(0);
    expect(m.indexAt(500)).toBe(0);
  });
});
