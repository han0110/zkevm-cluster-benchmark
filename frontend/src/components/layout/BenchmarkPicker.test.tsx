import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BenchmarkMeta } from '@/utils/benchmarkMeta';
import { BenchmarkPicker } from '@/components/layout/BenchmarkPicker';

// The picker reads each entry's metadata head through loadBenchmarkMeta. The test stands in a resolved
// meta so the table fills without a network fetch.
vi.mock('@/utils/benchmarkMeta', () => ({
  loadBenchmarkMeta: (url: string): Promise<BenchmarkMeta> =>
    Promise.resolve({
      id: url,
      name: `Name for ${url}`,
      description: `Description for ${url}`,
      software: { zkvm: { name: 'zisk', version: 'v0.18.0', phases: [] }, guest: { name: 'reth', version: 'v2.1.0' } },
      startedAt: 1748910235000,
    }),
}));

const entries = [
  { id: 'eest-60m-1', url: '/data/eest-60m-1.json' },
  { id: 'mainnet-2', url: '/data/mainnet-2.json' },
];

describe('BenchmarkPicker', () => {
  it('shows the selected name on the trigger and the id when no name is known', () => {
    const { rerender } = render(
      <BenchmarkPicker entries={entries} selectedId="eest-60m-1" selectedName="eest-60m" onSelect={() => {}} />
    );
    expect(screen.getByRole('button', { name: 'Select benchmark' }).textContent).toContain('eest-60m');
    rerender(<BenchmarkPicker entries={entries} selectedId="eest-60m-1" selectedName={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Select benchmark' }).textContent).toContain('eest-60m-1');
  });

  it('opens the table, loads each row metadata, and selects on row click', async () => {
    const onSelect = vi.fn();
    render(<BenchmarkPicker entries={entries} selectedId="eest-60m-1" selectedName="eest-60m" onSelect={onSelect} />);

    // No dialog until the trigger is pressed.
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select benchmark' }));
    const dialog = screen.getByRole('dialog', { name: 'Select benchmark' });

    // The merged software cell reads name and version together once the head resolves.
    await waitFor(() => expect(dialog.textContent).toContain('zisk@v0.18.0'));
    expect(dialog.textContent).toContain('reth@v2.1.0');

    // The current benchmark's row is marked selected.
    const rows = dialog.querySelectorAll('tbody tr');
    expect(rows[0]!.getAttribute('aria-selected')).toBe('true');

    // Choosing the other benchmark reports its id and closes the dialog.
    fireEvent.click(rows[1]!);
    expect(onSelect).toHaveBeenCalledWith('mainnet-2');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
