import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BlockLogConsole } from '@/features/blocks/BlockLogConsole';
import type { LogEntry } from '@/types/benchmark';

const logs: LogEntry[] = [
  { role: 'coordinator', time: 0, level: 'info', msg: 'job started' },
  { role: 'worker1', time: 1000, level: 'info', msg: 'phase 1' },
  { role: 'worker2', time: 2000, level: 'warn', msg: 'slow node' },
  { role: 'coordinator', time: 3000, level: 'error', msg: 'job failed' },
];

const rowCount = (root: HTMLElement): number => root.querySelectorAll('[data-measured-row]').length;
const openFilter = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
};

describe('BlockLogConsole', () => {
  it('filters by level and role with selected-set semantics', () => {
    const { container } = render(<BlockLogConsole logs={logs} />);
    // The Info preset selects info, warn, and error, so every line shows.
    expect(rowCount(container)).toBe(4);
    openFilter();

    // Deselecting info narrows to the warn and error lines.
    fireEvent.click(screen.getByRole('button', { name: 'info' }));
    expect(rowCount(container)).toBe(2);

    // Re-selecting info, then selecting only worker2, shows that role's single line.
    fireEvent.click(screen.getByRole('button', { name: 'info' }));
    fireEvent.click(screen.getByRole('button', { name: 'worker2' }));
    expect(rowCount(container)).toBe(1);
    expect(screen.getByText('slow node')).not.toBeNull();
  });

  it('hides debug by default and the All preset reveals it', () => {
    const withDebug: LogEntry[] = [...logs, { role: 'worker3', time: 2500, level: 'debug', msg: 'received' }];
    const { container } = render(<BlockLogConsole logs={withDebug} />);
    // Info excludes debug, so the debug line is hidden.
    expect(rowCount(container)).toBe(4);
    expect(screen.queryByText('received')).toBeNull();

    // All selects nothing, which shows every level including debug.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(rowCount(container)).toBe(5);
  });

  it('applies the exclude then include regex filters', async () => {
    const { container } = render(<BlockLogConsole logs={logs} />);
    openFilter();

    // Exclude hides the two matching lines after the debounce.
    fireEvent.change(screen.getByPlaceholderText(/exclude/), { target: { value: 'slow|failed' } });
    await waitFor(() => expect(rowCount(container)).toBe(2));
    expect(screen.queryByText('slow node')).toBeNull();

    // Include then keeps only the line matching it, applied together with the exclude.
    fireEvent.change(screen.getByPlaceholderText(/include/), { target: { value: 'started' } });
    await waitFor(() => expect(rowCount(container)).toBe(1));
    expect(screen.getByText('job started')).not.toBeNull();
  });

  it('reports the hovered line time and clears it when the cursor leaves', () => {
    const onHoverLog = vi.fn();
    const { container } = render(<BlockLogConsole logs={logs} onHoverLog={onHoverLog} />);
    const rows = container.querySelectorAll('[data-measured-row]');
    fireEvent.mouseEnter(rows[2]!);
    expect(onHoverLog).toHaveBeenLastCalledWith(2000);

    fireEvent.mouseLeave(container.querySelector('.overflow-y-auto')!);
    expect(onHoverLog).toHaveBeenLastCalledWith(null);
  });

  it('keeps the filter controls and shows the empty note when a block carries no logs', () => {
    render(<BlockLogConsole logs={[]} empty={<span>Logs are not available in this build.</span>} />);
    // The filter bar stays for consistency even with no logs to filter.
    expect(screen.getByRole('button', { name: 'Info' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'All' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Filter' })).not.toBeNull();
    // The caller's note fills the list area in place of log lines.
    expect(screen.getByText('Logs are not available in this build.')).not.toBeNull();
  });

  it('lights the Filter control whenever a filter applies, including the Info preset', () => {
    render(<BlockLogConsole logs={logs} />);
    const filterClass = () => screen.getByRole('button', { name: 'Filter' }).className;
    // Info is the opening preset and selects the signal levels, so a filter applies and the control is
    // active rather than the idle border-border style.
    expect(filterClass()).not.toContain('border-border');
    // All clears every selection, so nothing is filtered and the control returns to idle.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(filterClass()).toContain('border-border');
  });

  it('shows the level chips statically even when the logs lack those levels', () => {
    render(<BlockLogConsole logs={[{ role: 'coordinator', time: 0, level: 'info', msg: 'only info' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    for (const level of ['trace', 'debug', 'warn', 'error']) {
      expect(screen.getByRole('button', { name: level })).not.toBeNull();
    }
  });

  it('keeps a clearable role chip for a selected role the next block never emits', () => {
    const blockA: LogEntry[] = [
      { role: 'coordinator', time: 0, level: 'info', msg: 'a coordinator' },
      { role: 'worker9', time: 1000, level: 'info', msg: 'a worker9' },
    ];
    const blockB: LogEntry[] = [{ role: 'coordinator', time: 0, level: 'info', msg: 'b coordinator' }];
    const { container, rerender } = render(<BlockLogConsole logs={blockA} />);
    openFilter();

    // Selecting worker9 on block A narrows the list to its single line.
    fireEvent.click(screen.getByRole('button', { name: 'worker9' }));
    expect(rowCount(container)).toBe(1);

    // Navigating to a block that never emits worker9 would otherwise hide every line, so the chip stays
    // present and stays pressed, giving the reader a control to release the stranded selection.
    rerender(<BlockLogConsole logs={blockB} />);
    expect(rowCount(container)).toBe(0);
    const chip = screen.getByRole('button', { name: 'worker9' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    // Clearing the chip releases the selection and the block's own line shows.
    fireEvent.click(chip);
    expect(rowCount(container)).toBe(1);
    expect(screen.getByText('b coordinator')).not.toBeNull();
  });
});
