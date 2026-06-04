/*
 * Fullscreen overlay of a block's trace above its log console. The block's log lines load on demand
 * from a per-block tar.gz archive, fetched and untarred in the browser, so benchmark.json stays lean
 * and the bulky DEBUG-level logs travel only when a trace is opened. Hovering a log line marks its
 * moment on the trace with a dashed cursor. The overlay floats over the page and dismisses on the
 * close control, a press on the backdrop, or Escape.
 */

import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { BlockTrace } from '@/features/blocks/BlockTrace';
import { BlockLogConsole } from '@/features/blocks/BlockLogConsole';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { decodeLogArchive } from '@/utils/logArchive';
import { blockArchivePath } from '@/utils/archivePath';
import { microsToSeconds } from '@/utils/format';
import type { PhaseRegistry } from '@/utils/phases';
import type { Block, LogEntry } from '@/types/benchmark';

// Base URL the per-block log archives are served from under the local data directory, with the
// trailing slash trimmed so the path joins cleanly.
const LOG_BASE = `${import.meta.env.BASE_URL}data/log`.replace(/\/+$/, '');

const archiveUrl = (benchId: string, runId: string, blockName: string): string =>
  `${LOG_BASE}/${benchId}/${runId}/${blockArchivePath(blockName)}.tar.gz`;

// The load outcome of a block's log archive. It is still loading, ready with its lines (possibly an
// empty archive), absent because this build bundled no archive for the block, or a genuine fetch or
// decode failure.
type LogsState =
  | { status: 'loading' }
  | { status: 'ready'; logs: LogEntry[] }
  | { status: 'absent' }
  | { status: 'error'; error: string };

// Statuses that mean the archive is simply absent, so this build did not bundle the block's logs. A
// static host returns 404 for a missing file. The values 403 and 410 are tolerated as the same absence.
const ABSENT_STATUS = new Set([403, 404, 410]);

// A stable empty list for the non-ready states, so a fresh array literal never remounts the console and
// the reader's filter selection carries across blocks.
const EMPTY_LOGS: LogEntry[] = [];

// The log console memoized at module scope so a cursor hover, which re-renders the overlay to move the
// trace cursor, does not re-render the heavy windowed log list when its props are unchanged. The hover
// callback and the logs and empty values are kept referentially stable across cursor changes so this
// memo holds.
const LogConsole = memo(BlockLogConsole);

// Fetches a block's log archive on demand and untars it. An archive that is missing by status, or a
// response that is not an archive at all, reads as the logs being unavailable in this build rather than
// an error or an empty console.
function useBlockLogs(benchId: string, runId: string, blockName: string): LogsState {
  const [state, setState] = useState<LogsState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(archiveUrl(benchId, runId, blockName), { signal: controller.signal })
      .then(res => {
        if (ABSENT_STATUS.has(res.status)) return null;
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then(buffer => {
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

export function BlockTraceFullscreen({
  benchId,
  runId,
  block,
  nodes,
  registry,
  onClose,
}: {
  benchId: string;
  runId: string;
  block: Block;
  nodes: string[];
  registry: PhaseRegistry;
  onClose: () => void;
}) {
  // The time in seconds of the hovered log line, drawn as a dashed cursor on the trace.
  const [cursorSec, setCursorSec] = useState<number | null>(null);
  // A new block clears the hover cursor so a stale mark from the previous block does not linger when
  // keyboard navigation moves the overlay to another block.
  useEffect(() => setCursorSec(null), [block.name]);

  const logState = useBlockLogs(benchId, runId, block.name);

  const ganttHeight = Math.max(180, Math.min(360, block.nodes.length * 44 + 80));

  // The list area note while the archive is not yet ready, so the console keeps its filter bar and
  // frame rather than vanishing. A ready archive passes no note, letting the console show its own empty
  // note when a filter hides every line. Memoized so a cursor hover, which leaves the load state
  // unchanged, does not hand the memoized console a fresh element and re-render it.
  const logEmpty = useMemo(
    () =>
      logState.status === 'loading' ? (
        <EmptyState tone="faint">Loading logs...</EmptyState>
      ) : logState.status === 'error' ? (
        <EmptyState tone="warning">Failed to load logs: {logState.error}</EmptyState>
      ) : logState.status === 'absent' ? (
        <EmptyState tone="faint" className="max-w-md text-center">
          Logs are not available in this build.
        </EmptyState>
      ) : undefined,
    [logState]
  );

  // The lines handed to the console, the loaded archive once ready and the shared empty list otherwise.
  // Memoized so a cursor hover does not produce a fresh value and re-render the memoized console.
  const logs = useMemo(() => (logState.status === 'ready' ? logState.logs : EMPTY_LOGS), [logState]);

  // A stable hover handler so a cursor hover does not change the console's props and re-render it. The
  // microsecond time of the hovered line is converted to the seconds the trace cursor reads.
  const onHoverLog = useCallback(
    (us: number | null) => setCursorSec(us != null ? microsToSeconds(us) : null),
    []
  );

  return (
    <Modal
      title="Trace and logs"
      ariaLabel="Block trace and logs"
      onDismiss={onClose}
      closeLabel="Close trace fullscreen"
      panelClassName="fixed inset-y-6 left-1/2 z-50 flex w-[calc(100%-3rem)] max-w-[1280px] -translate-x-1/2 flex-col gap-3 rounded-xl border border-border bg-elevated p-4 shadow-2xl"
    >
      <p className="-mt-1 text-xs text-faint">Hover a log line to mark its moment on the trace.</p>
      <div className="shrink-0">
        <BlockTrace block={block} nodes={nodes} registry={registry} height={ganttHeight} cursorSec={cursorSec} />
      </div>
      <div className="min-h-0 flex-1">
        {/* The console renders in every log state, keeping its filter bar for consistency, with the
            list area carrying the loading, absent, or failure note. It is not remounted per block, so a
            filter the reader set carries across keyboard navigation between blocks. */}
        <LogConsole logs={logs} empty={logEmpty} onHoverLog={onHoverLog} />
      </div>
    </Modal>
  );
}
