/* Access to the loaded benchmark the Layout shares with every routed page through the outlet context. */

import { useOutletContext } from 'react-router-dom';
import type { Benchmark } from '@/types/benchmark';

// The loaded benchmark for the active run. A page only renders once the Layout has the data, so the
// context is always present here.
export function useBench(): Benchmark {
  return useOutletContext<Benchmark>();
}
