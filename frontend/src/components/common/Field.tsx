/*
 * A captioned control group inside a filter panel, an overline caption above its children. The blocks
 * table filter panel and the log console filter popover share it so the two read as one control.
 */

import type { ReactNode } from 'react';
import { OVERLINE } from '@/utils/styles';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={OVERLINE}>{label}</span>
      {children}
    </div>
  );
}
