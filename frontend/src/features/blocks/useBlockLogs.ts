/*
 * On-demand loader for a block's per-block log archive. A build-time index records which blocks ship an
 * archive in this build, so a block the build bundled no logs for is reported absent at once, with no
 * network request. For an indexed block the archive is fetched, untarred, and decoded; a missing-by-status
 * response or a body that is not an archive also reads as the logs being unavailable rather than an error.
 * Kept apart from the overlay component so the gate can be unit-tested without rendering the trace chart.
 */

import { useEffect, useState } from 'react';
import { decodeLogArchive } from '@/utils/logArchive';
import { archiveRelPath } from '@/utils/archivePath';
import { hasLogArchive } from '@/utils/logArchiveIndex';
import type { LogEntry } from '@/types/benchmark';

// Base URL the per-block log archives are served from under the local data directory, with the trailing
// slash trimmed so the path joins cleanly.
const LOG_BASE = `${import.meta.env.BASE_URL}data/log`.replace(/\/+$/, '');

const archiveUrl = (benchId: string, runId: string, blockName: string): string =>
  `${LOG_BASE}/${archiveRelPath(benchId, runId, blockName)}`;

// The load outcome of a block's log archive. It is still loading, ready with its lines (possibly an
// empty archive), absent because this build bundled no archive for the block, or a genuine fetch or
// decode failure.
export type LogsState =
  | { status: 'loading' }
  | { status: 'ready'; logs: LogEntry[] }
  | { status: 'absent' }
  | { status: 'error'; error: string };

// Statuses that mean the archive is simply absent, so this build did not bundle the block's logs. The
// build-time index already keeps an absent archive from being fetched, so this guards only the rare case
// of an indexed file that has since gone missing. A static host returns 404; 403 and 410 read the same.
const ABSENT_STATUS = new Set([403, 404, 410]);

// A stable empty list for the non-ready states, so a fresh array literal never remounts the console and
// the reader's filter selection carries across blocks.
export const EMPTY_LOGS: LogEntry[] = [];

// Loads a block's log archive on demand and untars it. A block the build-time index lists no archive for
// is reported absent at once, with no network request, which is the common case for a build that bundled
// no logs. For an indexed block, an archive missing by status, or a response that is not an archive at
// all, also reads as the logs being unavailable rather than an error or an empty console.
export function useBlockLogs(benchId: string, runId: string, blockName: string): LogsState {
  const [state, setState] = useState<LogsState>({ status: 'loading' });
  useEffect(() => {
    if (!hasLogArchive(benchId, runId, blockName)) {
      setState({ status: 'absent' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(archiveUrl(benchId, runId, blockName), { signal: controller.signal })
      .then(res => {
        if (ABSENT_STATUS.has(res.status)) return null;
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then(buffer => {
        // A late resolution after the effect was torn down (a fast block-to-block navigation) must not
        // write the previous block's logs onto the current one, so a settled but aborted load is dropped.
        if (controller.signal.aborted) return;
        const logs = buffer === null ? null : decodeLogArchive(buffer);
        setState(logs === null ? { status: 'absent' } : { status: 'ready', logs });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [benchId, runId, blockName]);
  return state;
}
