/*
 * Dismissal listeners shared by the page's small overlays, a dropdown popover and a filter panel. While
 * open it closes the overlay on a pointer press outside every anchor ref and on Escape, and when a
 * reflow handler is supplied it also responds to a capturing window scroll or resize that would move the
 * anchor. Listeners attach only while open and detach on close or unmount, so a closed overlay leaves no
 * window listener behind.
 */

import { useEffect, type RefObject } from 'react';

interface DismissableOptions {
  // The elements that count as inside, so a press within any of them never dismisses the overlay.
  refs: Array<RefObject<HTMLElement | null>>;
  // An optional response to a scroll or resize, supplied by an overlay whose position tracks an anchor.
  onReflow?: () => void;
}

export function useDismissable(
  open: boolean,
  setOpen: (open: boolean) => void,
  { refs, onReflow }: DismissableOptions
): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (refs.some(ref => ref.current?.contains(t))) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      // Marking Escape handled so an underlying master-detail panel, whose own Escape listener checks
      // defaultPrevented, does not also close beneath this overlay. The topmost overlay claims the key.
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    if (onReflow) {
      window.addEventListener('scroll', onReflow, true);
      window.addEventListener('resize', onReflow);
    }
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      if (onReflow) {
        window.removeEventListener('scroll', onReflow, true);
        window.removeEventListener('resize', onReflow);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
