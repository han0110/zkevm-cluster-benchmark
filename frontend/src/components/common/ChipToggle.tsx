/*
 * A row of toggle chips shared by the multi-select filters, one pill per item. Each chip reports its
 * pressed state through aria-pressed and toggles the item on click, wearing the active accent while
 * selected and the idle pill treatment otherwise.
 */

import { type JSX } from 'react';
import { cx } from '@/utils/cx';
import { ACTIVE_ACCENT, FOCUS_RING, PILL, PILL_IDLE } from '@/utils/styles';

export function ChipRow<T>({
  items,
  isSelected,
  onToggle,
  getKey,
  getLabel,
  className,
}: {
  items: T[];
  isSelected: (item: T) => boolean;
  onToggle: (item: T) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {items.map(item => {
        const selected = isSelected(item);
        return (
          <button
            key={getKey(item)}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(item)}
            className={cx(PILL, FOCUS_RING, selected ? ACTIVE_ACCENT : PILL_IDLE)}
          >
            {getLabel(item)}
          </button>
        );
      })}
    </div>
  );
}
