import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';

const copy = vi.fn();
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: (t: string) => copy(t) }));

describe('useCopyFeedback', () => {
  beforeEach(() => {
    copy.mockReset();
    vi.useFakeTimers();
  });

  it('reports the copied state and resets to idle after the delay', async () => {
    copy.mockResolvedValue(true);
    const { result } = renderHook(() => useCopyFeedback(1000));
    expect(result.current.state).toBe('idle');

    await act(async () => {
      await result.current.copy('test::block[id]');
    });
    expect(copy).toHaveBeenCalledWith('test::block[id]');
    expect(result.current.state).toBe('copied');

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state).toBe('idle');
  });

  it('reports the failed state when the copy fails', async () => {
    copy.mockResolvedValue(false);
    const { result } = renderHook(() => useCopyFeedback());
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.state).toBe('failed');
  });
});
