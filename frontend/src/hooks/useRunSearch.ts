/* The active benchmark as a query string for links and redirects that keep it across views. The
 * benchmark is selected by its unique id in the `id` query parameter, distinct from the per-run run_id
 * in the proof and metric detail paths. */

import { useSearchParams, type SetURLSearchParams } from 'react-router-dom';

// The selected benchmark as a leading-question-mark query string, or an empty string when none is set.
export function useRunSearch(): string {
  const [params] = useSearchParams();
  const id = params.get('id');
  return id ? `?${new URLSearchParams({ id }).toString()}` : '';
}

// Sets the selected benchmark in the URL query, replacing the history entry and preserving the other
// params, so switching benchmarks and pinning the resolved benchmark both go through one place.
export function setRunParam(setParams: SetURLSearchParams, id: string): void {
  setParams(
    prev => {
      const next = new URLSearchParams(prev);
      next.set('id', id);
      return next;
    },
    { replace: true }
  );
}
