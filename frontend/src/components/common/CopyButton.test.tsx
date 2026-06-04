import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { CopyButton } from '@/components/common/CopyButton';

const copy = vi.fn();
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: (t: string) => copy(t) }));

describe('CopyButton', () => {
  beforeEach(() => {
    copy.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('copies the text, flashes the success cue, then resets after the default delay', async () => {
    copy.mockResolvedValue(true);
    render(<CopyButton text="test::block[id]" label="Copy block name" />);
    const btn = screen.getByRole('button', { name: 'Copy block name' });
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });
    expect(copy).toHaveBeenCalledWith('test::block[id]');
    expect(btn.className).toContain('text-success');

    // The shared hook returns the cue to idle after its 1500 ms default.
    act(() => vi.advanceTimersByTime(1500));
    expect(btn.className).not.toContain('text-success');
  });

  it('does not flash the cue when the copy fails', async () => {
    copy.mockResolvedValue(false);
    render(<CopyButton text="x" label="Copy" />);
    const btn = screen.getByRole('button', { name: 'Copy' });
    fireEvent.click(btn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(btn.className).not.toContain('text-success');
  });
});
