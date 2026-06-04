/*
 * Two-pane split where the left pane fills the area until a right pane is supplied, when a draggable
 * divider appears. The split is the right pane's share of the width, persisted under a key so it survives
 * a reload and the navigation remount, clamped so neither pane falls below a usable minimum, and operable
 * from the keyboard. Pages decide each pane and drive the right one from the URL, so this is purely the
 * shared resize mechanism behind the Blocks and Metrics views.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cx } from '@/utils/cx';
import { FOCUS_RING } from '@/utils/styles';

// Right pane's share of the width when first opened, a wide reveal that reads clearly while keeping the
// left pane scannable. The divider adjusts it from there.
const DEFAULT_FRACTION = 0.7;
// Smallest usable width in px per pane, the clamp the divider respects.
const MIN_LEFT_PX = 120;
const MIN_RIGHT_PX = 340;
// Width one arrow-key press moves the divider, so the split is adjustable without a pointer.
const KEYBOARD_STEP_PX = 48;

// Right fraction for a desired right-pane width, clamped so neither pane falls below its minimum and the
// fraction stays in the container so the left pane never inverts to a negative grow. When the container
// cannot honor both minimums the right pane takes the whole width and the left collapses to zero not past.
const clampFraction = (rightPx: number, widthPx: number): number => {
  if (widthPx <= 0) return DEFAULT_FRACTION;
  const maxRight = Math.min(widthPx, Math.max(MIN_RIGHT_PX, widthPx - MIN_LEFT_PX));
  const lo = Math.min(MIN_RIGHT_PX, maxRight);
  return Math.min(Math.max(rightPx, lo), maxRight) / widthPx;
};

interface ResizableSplitProps {
  left: ReactNode;
  // The right pane, or null when nothing is open, in which case the left pane fills the width.
  right: ReactNode | null;
  // localStorage key under which the chosen split is persisted.
  storageKey: string;
  // Accessible label for the divider, naming what it resizes.
  resizeLabel: string;
}

export function ResizableSplit({ left, right, storageKey, resizeLabel }: ResizableSplitProps) {
  const open = right != null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fraction, setFraction] = usePersistentState(storageKey, DEFAULT_FRACTION);
  // Teardown for an in-flight drag, run on unmount so a drag interrupted by a route or run change cannot
  // leak window listeners or leave the page unselectable.
  const dragTeardown = useRef<(() => void) | null>(null);
  useEffect(() => () => dragTeardown.current?.(), []);

  // Drag the divider to resize. A fresh move/stop pair binds per drag so the handlers read the latest
  // container rect, and the stop is parked in a ref so an unmount mid-drag tears it down. The drag ends
  // on pointer up or cancel so a pointer lost to the OS still releases the page.
  const onDividerPointerDown = useCallback((e: React.PointerEvent): void => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    const move = (ev: PointerEvent): void => {
      const rect = el.getBoundingClientRect();
      setFraction(clampFraction(rect.right - ev.clientX, rect.width));
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.userSelect = '';
      dragTeardown.current = null;
    };
    dragTeardown.current = stop;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [setFraction]);

  // Arrow keys nudge the divider. Left widens the right pane by moving the divider left, right narrows it.
  const onDividerKeyDown = useCallback((e: React.KeyboardEvent): void => {
    const delta = e.key === 'ArrowLeft' ? KEYBOARD_STEP_PX : e.key === 'ArrowRight' ? -KEYBOARD_STEP_PX : 0;
    if (delta === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    e.preventDefault();
    setFraction(f => clampFraction(f * rect.width + delta, rect.width));
  }, [setFraction]);

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div className="min-w-0 overflow-hidden" style={{ flexGrow: open ? Math.max(0, 1 - fraction) : 1, flexBasis: 0 }}>
        {left}
      </div>

      {open && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={resizeLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            tabIndex={0}
            onPointerDown={onDividerPointerDown}
            onKeyDown={onDividerKeyDown}
            className={cx(
              'group mx-6 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center rounded',
              FOCUS_RING
            )}
          >
            <div className="h-full w-px bg-border transition-colors group-hover:bg-primary" />
          </div>

          <div className="min-w-0 overflow-hidden" style={{ flexGrow: fraction, flexBasis: 0 }}>
            {right}
          </div>
        </>
      )}
    </div>
  );
}
