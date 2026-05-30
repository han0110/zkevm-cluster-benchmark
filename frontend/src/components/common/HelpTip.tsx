/* A circled question mark that reveals an explanation on hover or focus, for clarifying a metric. */

import { cx } from '@/utils/cx';
import { REVEAL_BOX } from '@/utils/styles';

export function HelpTip({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cx('group/help relative inline-flex cursor-pointer align-middle text-faint transition-colors hover:text-muted', className)}
      tabIndex={0}
      role="img"
      aria-label={text}
    >
      {/* The mark is drawn as SVG so the question glyph stays optically centered in the ring at any size. */}
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <circle cx="8" cy="8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <text x="8" y="8" textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="700" fill="currentColor">
          ?
        </text>
      </svg>
      {/* The explanation box opens instantly below the mark, where the table does not clip it, and reads
          in normal case so it is legible inside an uppercase header. */}
      <span
        role="tooltip"
        className={cx(
          REVEAL_BOX,
          'left-1/2 w-56 -translate-x-1/2 text-[11px] text-muted group-hover/help:block group-focus/help:block'
        )}
      >
        {text}
      </span>
    </span>
  );
}
