/* A titled section with an optional subtitle, wrapping a chart or chart group. */

import type { ReactNode } from 'react';
import { SectionHeading } from '@/components/common/SectionHeading';

export function ChartSection({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{title}</SectionHeading>
      {subtitle && <p className="-mt-1 text-xs text-faint">{subtitle}</p>}
      {children}
    </section>
  );
}
