/* A small round swatch followed by a label, used for chart legends. */

import { SWATCH_DOT } from '@/utils/styles';

export function ColorDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={SWATCH_DOT} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
