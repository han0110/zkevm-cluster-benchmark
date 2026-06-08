/*
 * Fullscreen overlay of a block's trace above its log console. The block's log lines load on demand
 * from a per-block tar.json archive, fetched and untarred in the browser, so benchmark.json stays lean
 * and the bulky DEBUG-level logs travel only when a trace is opened. A build-time index records which
 * blocks ship an archive, so a block the build bundled no logs for is reported absent without any
 * network request. Hovering a log line marks its moment on the trace with a dashed cursor. The overlay
 * floats over the page and dismisses on the close control, a press on the backdrop, or Escape.
 */

import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { BlockTrace } from '@/features/blocks/BlockTrace';
import { BlockLogConsole } from '@/features/blocks/BlockLogConsole';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { useBlockLogs, EMPTY_LOGS } from '@/features/blocks/useBlockLogs';
import { microsToSeconds } from '@/utils/format';
import type { PhaseRegistry } from '@/utils/phases';
import type { Block } from '@/types/benchmark';

// The log console memoized at module scope so a cursor hover, which re-renders the overlay to move the
// trace cursor, does not re-render the heavy windowed log list when its props are unchanged. The hover
// callback and the logs and empty values are kept referentially stable across cursor changes so this
// memo holds.
const LogConsole = memo(BlockLogConsole);

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
