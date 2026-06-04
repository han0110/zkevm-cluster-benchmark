import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { BlocksPage } from '@/features/blocks/BlocksPage';
import { fixture } from '@/test/fixture';
import type { Benchmark } from '@/types/benchmark';

// Mounts the Blocks page under a router with the benchmark supplied through the outlet context the
// Layout normally provides. The page owns the filter row and the table, so the table behaviour is
// exercised through the page that drives it.
function renderTable(bench: Benchmark) {
  return render(
    <MemoryRouter initialEntries={['/blocks']}>
      <Routes>
        <Route element={<Outlet context={bench} />}>
          <Route path="/blocks" element={<BlocksPage />} />
          <Route path="/blocks/:runIdx/:blockId" element={<BlocksPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const dataRows = (root: HTMLElement): number => root.querySelectorAll('tbody tr[data-row]').length;

describe('BlocksTable', () => {
  it('combines runs with run and latest columns, defaults to latest-only, and links by run index', () => {
    const { container } = renderTable(fixture);

    // The run and latest-attempt columns the multi-run view adds beside the per-block fields. The sort
    // toggle in each header carries the column label as its accessible name.
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Latest' })).toBeTruthy();

    // Latest-only is pressed by default, so each block shows once, namely 0001 from run0, and 0002 and
    // weird'id from the later run1.
    expect(dataRows(container)).toBe(3);
    // Detail links carry the source run index, the short token the path uses in place of the run id.
    expect(container.querySelector('a[href="/blocks/0/0001"]')).toBeTruthy();
    expect(container.querySelector('a[href="/blocks/1/0002"]')).toBeTruthy();

    // Turning latest-only off reveals the superseded run0 attempts, five rows across two runs, two of them
    // no longer the latest attempt.
    fireEvent.click(screen.getByRole('button', { name: 'Latest only' }));
    expect(dataRows(container)).toBe(5);
    expect(screen.getAllByText('No')).toHaveLength(2);
  });
});
