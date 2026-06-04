/* A titled section with an optional subtitle and an optional header action, wrapping a chart or group. */

import type { ReactNode } from 'react';
import { SectionHeading } from '@/components/common/SectionHeading';

export function ChartSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  // An optional control rendered on the right of the heading, such as a sort toggle.
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading>{title}</SectionHeading>
        {action}
      </div>
      {subtitle && <p className="-mt-1 text-xs text-faint">{subtitle}</p>}
      {children}
    </section>
  );
}
