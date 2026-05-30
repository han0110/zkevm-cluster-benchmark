/* A thin horizontal bar whose segments are sized proportionally, for compact phase-mix previews. */

import { cx } from '@/utils/cx';

export interface Segment {
  value: number;
  color: string;
}

export function ProportionBar({ segments, className }: { segments: Segment[]; className?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className={cx('flex h-1.5 w-full overflow-hidden rounded-sm bg-elevated', className)}>
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
      ))}
    </div>
  );
}
