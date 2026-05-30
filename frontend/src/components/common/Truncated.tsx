/*
 * Single-line text that clips with an ellipsis and reveals its full value in a hover box. Fixtures carry
 * long ids such as a pytest node id, too long for a table cell or breadcrumb, so the text is truncated
 * and the whole value appears in a tooltip on hover or focus. It is a plain inline span so it composes
 * inside a link or heading without changing their layout, and the reveal box is positioned absolutely so
 * it escapes the clipped line.
 */

import { cx } from '@/utils/cx';
import { REVEAL_BOX } from '@/utils/styles';

export function Truncated({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cx('group/trunc relative inline-block min-w-0 max-w-full truncate align-bottom', className)}
      tabIndex={0}
    >
      {text}
      <span
        role="tooltip"
        className={cx(
          REVEAL_BOX,
          'left-0 max-w-md break-all text-xs text-foreground group-hover/trunc:block group-focus/trunc:block'
        )}
      >
        {text}
      </span>
    </span>
  );
}
