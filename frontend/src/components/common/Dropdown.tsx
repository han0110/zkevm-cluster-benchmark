/*
 * A compact dropdown, a truncating button that opens a portalled popover list. The popover floats over
 * the page with fixed positioning so it shows full option labels instead of being clipped by a narrow
 * container, and closes on outside click, Escape, selection, and any scroll or resize that would move
 * the button. The run selector and the proof-sort control share it so the two read as one control.
 */

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/utils/cx';
import { FOCUS_RING } from '@/utils/styles';
import { IconChevronDown } from '@/components/common/icons';
import { useDismissable } from '@/hooks/useDismissable';

export interface DropdownItem {
  id: string;
  label: string;
}

interface DropdownProps<T extends DropdownItem> {
  items: T[];
  selectedId: string | null;
  onSelect: (item: T) => void;
  ariaLabel?: string;
  // Wrapper sizing, defaulting to full width so the control fills its container.
  className?: string;
}

interface Anchor {
  top: number;
  left: number;
  width: number;
}

export function Dropdown<T extends DropdownItem>({ items, selectedId, onSelect, ariaLabel, className }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();
  const active = items.find(i => i.id === selectedId) ?? items[0] ?? null;

  const toggle = (): void => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
  };

  // Close the popover on outside click, Escape, or any scroll or resize that would move the button.
  useDismissable(open, setOpen, { refs: [btnRef, popRef], onReflow: () => setOpen(false) });

  if (!active) return null;

  return (
    <div className={cx('relative', className ?? 'w-full')}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        className={cx(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/60',
          FOCUS_RING
        )}
      >
        <span className="truncate">{active.label}</span>
        <IconChevronDown className={cx('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open &&
        anchor &&
        createPortal(
          <ul
            id={listboxId}
            ref={popRef}
            role="listbox"
            style={{ position: 'fixed', top: anchor.top, left: anchor.left, minWidth: anchor.width }}
            className="z-50 max-h-80 w-max max-w-[26rem] overflow-y-auto rounded-lg border border-border bg-elevated p-1 shadow-lg"
          >
            {items.map(item => {
              const isActive = item.id === active.id;
              return (
                <li key={item.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    className={cx(
                      'w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors',
                      FOCUS_RING,
                      isActive ? 'bg-primary/15 font-medium text-primary' : 'text-muted hover:bg-surface hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}

