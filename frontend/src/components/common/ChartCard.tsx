/* Surface card wrapper used for every chart and stat panel. */

import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { SURFACE } from '@/utils/styles';

export function ChartCard({
  children,
  className,
  padding = 'p-4',
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div className={cx(SURFACE, padding, className)}>{children}</div>
  );
}
