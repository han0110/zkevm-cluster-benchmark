/* A square icon-only control sharing the muted hover treatment, used for the detail-panel close button. */

import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { FOCUS_RING } from '@/utils/styles';

export function IconButton({
  onClick,
  label,
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-elevated/60 hover:text-foreground',
        FOCUS_RING,
        className
      )}
    >
      {children}
    </button>
  );
}
