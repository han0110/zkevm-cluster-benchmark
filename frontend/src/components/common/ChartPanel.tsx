/*
 * A Grafana-style chart panel. The title, optional subtitle, and optional header action sit inside the
 * surface box, separated from the chart body by a horizontal rule. Stat and table panels keep the
 * lighter ChartSection treatment instead, so the in-box header is reserved for charts.
 */

import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { SURFACE } from '@/utils/styles';

export function ChartPanel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  // An optional control rendered on the right of the header, such as a sort toggle or a fullscreen icon.
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(SURFACE, 'flex flex-col', className)}>
      <header className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-faint">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="border-t border-border p-4">{children}</div>
    </section>
  );
}
