/*
 * Application shell. Resolves the selected benchmark from the ?id query parameter, loads its document,
 * and renders the navigation rail beside the active route. The loaded benchmark reaches the routed pages
 * through the outlet context, so a page never renders until its data is present and can treat the
 * benchmark as non-null.
 */

import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useRun, useRunIndex } from '@/hooks/useRuns';
import { usePersistentState } from '@/hooks/usePersistentState';
import { setRunParam } from '@/hooks/useRunSearch';
import { Sidebar } from '@/components/layout/Sidebar';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// Product name shown in the sidebar across every run and while a run loads.
const APP_TITLE = 'Cluster Benchmark';

export function Layout() {
  const runs = useRunIndex();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const benchId = params.get('id');

  // The active benchmark is the URL-named one, falling back to the first when the name is absent or
  // unknown so a bare URL still resolves.
  const selected = useMemo(() => runs.find(r => r.id === benchId) ?? runs[0] ?? null, [runs, benchId]);

  // Pin the resolved benchmark back into the URL so every link carries a concrete id and the address
  // stays shareable. Runs only when the URL names no benchmark or an absent one.
  useEffect(() => {
    if (selected && benchId !== selected.id) {
      setRunParam(setParams, selected.id);
    }
  }, [selected, benchId, setParams]);

  const { data: bench, loading, error } = useRun(selected);

  // The rail collapses to an icon-only strip, freeing width while keeping navigation. The choice is
  // persisted so a reload keeps the rail as the reader left it.
  const [collapsed, setCollapsed] = usePersistentState('sidebar-collapsed', false);

  return (
    <div className="flex h-screen">
      <Sidebar
        title={APP_TITLE}
        runs={runs}
        selectedRunId={selected?.id ?? null}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
      />
      <main className="min-w-0 flex-1 overflow-hidden p-6">
        {loading && (
          <div className="flex h-full items-center justify-center gap-3 text-muted">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span className="text-sm">Loading run...</span>
          </div>
        )}
        {error && <p className="text-danger">Failed to load run: {error}</p>}
        {!loading && !error && runs.length === 0 && (
          <p className="text-muted">No benchmark runs found in the data directory.</p>
        )}
        {bench && (
          // Keyed per benchmark and per top-level section, not per full path, so navigating within
          // proofs or within metrics updates the mounted view in place rather than remounting and
          // resetting scroll. resetKey still clears a caught error on any nav.
          <ErrorBoundary key={`${bench.id}-${location.pathname.split('/')[1] || 'root'}`} resetKey={location.pathname}>
            <div className="flex h-full min-h-0 flex-col gap-4">
              <Breadcrumb />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Outlet context={bench} />
              </div>
            </div>
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
