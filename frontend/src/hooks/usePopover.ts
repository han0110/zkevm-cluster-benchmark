/*
 * Open-state and dismissal wiring shared by the small overlays anchored to a trigger button. The hook
 * holds the open flag and the trigger and panel refs and closes on Escape or a press outside either
 * ref. Each call site keeps its own trigger button inside a relative container, wires the trigger ref
 * and aria-expanded and the toggle handler, and renders PopoverPanel while open.
 */

import { useRef, useState } from 'react';
import { useDismissable } from '@/hooks/useDismissable';

export function usePopover(): {
  open: boolean;
  toggle: () => void;
  close: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDismissable(open, setOpen, { refs: [panelRef, triggerRef] });

  return {
    open,
    toggle: () => setOpen(o => !o),
    close: () => setOpen(false),
    triggerRef,
    panelRef,
  };
}
