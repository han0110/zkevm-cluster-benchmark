/*
 * A square icon-only control sharing the app's icon-button chrome, the muted glyph lifting to a faint
 * background and full foreground on hover. The size variant grows the padding and glyph together so
 * every icon button reads in the same proportion, and the effect matches the breadcrumb copy control and
 * the detail-panel and overlay close buttons.
 */

import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { FOCUS_RING, ICON_BUTTON, ICON_BUTTON_COLOR, ICON_BUTTON_MD, ICON_BUTTON_SM } from '@/utils/styles';

const SIZE = { sm: ICON_BUTTON_SM, md: ICON_BUTTON_MD };

export function IconButton({
  onClick,
  label,
  size = 'md',
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(ICON_BUTTON, ICON_BUTTON_COLOR, SIZE[size], FOCUS_RING, className)}
    >
      {children}
    </button>
  );
}
