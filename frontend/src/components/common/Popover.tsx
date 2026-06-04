/*
 * The shared panel surface for the small overlays anchored to a trigger button. It supplies the rounded
 * elevated surface and left or right alignment under the trigger. The open flag and the trigger and
 * panel refs come from usePopover, which each call site wires to its own trigger button.
 */

import { type JSX } from 'react';
import { cx } from '@/utils/cx';

export function PopoverPanel({
  panelRef,
  align = 'left',
  className,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  align?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      ref={panelRef}
      className={cx(
        'absolute top-full mt-2 rounded-xl border border-border bg-elevated p-4 shadow-lg z-40',
        align === 'right' ? 'right-0' : 'left-0',
        className
      )}
    >
      {children}
    </div>
  );
}
