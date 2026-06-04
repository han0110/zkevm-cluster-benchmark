/*
 * Clipboard copy with a brief result cue shared by copy controls. A copy attempt sets the state to
 * 'copied' on success or 'failed' on failure, and a timer then returns the state to 'idle' after
 * resetMs. The timer id lives in a ref so a fresh copy cancels the pending reset before re-arming, and an
 * unmount cleanup clears it so an unmounted control never sets state.
 */

import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/utils/clipboard';

export type CopyState = 'idle' | 'copied' | 'failed';

export function useCopyFeedback(resetMs = 1500): { state: CopyState; copy: (text: string) => Promise<void> } {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (text: string): Promise<void> => {
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), resetMs);
  };

  return { state, copy };
}
