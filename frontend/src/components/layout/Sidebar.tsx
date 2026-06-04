/*
 * Left navigation rail holding the app title, run selector, and three view links. Every link carries the
 * active run in its query string, and changing the selector swaps the run while keeping the current
 * view. A toggle collapses the rail to an icon-only strip where the title and selector give way to the
 * view icons alone, gaining content width without losing navigation.
 */

import type { ComponentType, SVGProps } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cx } from '@/utils/cx';
import { ACTIVE_ACCENT, FOCUS_RING } from '@/utils/styles';
import { BenchmarkPicker } from '@/components/layout/BenchmarkPicker';
import { IconButton } from '@/components/common/IconButton';
import { IconChevronLeft, IconChevronRight, IconNodes, IconOverview, IconBlocks } from '@/components/common/icons';
import { setRunParam, useRunSearch } from '@/hooks/useRunSearch';
import type { RunIndexEntry } from '@/types/benchmark';

interface SidebarProps {
  title: string;
  runs: RunIndexEntry[];
  selectedRunId: string | null;
  // The active benchmark's display name once loaded, shown on the picker trigger. Null while the
  // document loads, when the id stands in.
  selectedName: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

interface Tab {
  label: string;
  base: string;
  to: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

// Each view opens on its own table, the blocks and metrics views sliding their detail in from there.
const TABS: Tab[] = [
  { label: 'Overview', base: '/overview', to: '/overview', Icon: IconOverview },
  { label: 'Blocks', base: '/blocks', to: '/blocks', Icon: IconBlocks },
  { label: 'Metrics', base: '/metrics', to: '/metrics', Icon: IconNodes },
];

export function Sidebar({ title, runs, selectedRunId, selectedName, collapsed, onToggle }: SidebarProps) {
  const [, setParams] = useSearchParams();
  const { pathname } = useLocation();

  // Only the run travels between views, so links carry just that parameter not the whole query string.
  const search = useRunSearch();

  // A view is active when the path is its base or sits under it, so an open block keeps Blocks lit and a
  // focused node keeps Metrics lit.
  const isActive = (base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

  return (
    <nav
      className={cx(
        'flex shrink-0 flex-col overflow-y-auto border-r border-border',
        collapsed ? 'w-16 items-center gap-3 p-2' : 'w-56 gap-4 p-3'
      )}
    >
      {collapsed ? (
        <span
          title={title}
          className="grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-sm font-semibold text-primary"
        >
          {title.charAt(0)}
        </span>
      ) : (
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      )}

      {!collapsed && runs.length === 0 && <p className="text-xs text-muted">No runs found.</p>}
      {!collapsed && runs.length > 0 && (
        <BenchmarkPicker
          entries={runs}
          selectedId={selectedRunId}
          selectedName={selectedName}
          onSelect={id => setRunParam(setParams, id)}
        />
      )}

      <div className={cx('flex flex-col gap-1', collapsed ? 'items-center' : 'w-full')}>
        {TABS.map(tab => {
          const active = isActive(tab.base);
          return collapsed ? (
            <Link
              key={tab.base}
              to={{ pathname: tab.to, search }}
              title={tab.label}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'grid h-10 w-10 place-items-center rounded-md transition-colors',
                FOCUS_RING,
                active ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-elevated/60 hover:text-foreground'
              )}
            >
              <tab.Icon className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              key={tab.base}
              to={{ pathname: tab.to, search }}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-left text-sm font-medium transition-colors',
                FOCUS_RING,
                active
                  ? ACTIVE_ACCENT
                  : 'border-transparent text-muted hover:bg-elevated/60 hover:text-foreground'
              )}
            >
              <tab.Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      <IconButton
        onClick={onToggle}
        label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cx('mt-auto', !collapsed && 'self-end')}
      >
        {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
      </IconButton>
    </nav>
  );
}
