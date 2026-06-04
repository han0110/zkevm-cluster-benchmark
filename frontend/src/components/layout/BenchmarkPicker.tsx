/*
 * Benchmark selector as a modal table listing every benchmark with its name, description, time,
 * software, and id. Each row's metadata is read on demand through loadBenchmarkMeta, so opening the
 * picker never loads the full documents. The modal dismisses on the close control, a backdrop press,
 * or Escape.
 */

import { useEffect, useRef, useState } from 'react';
import { cx } from '@/utils/cx';
import { FOCUS_RING, OVERLINE, ROW_BASE, ROW_ACTIVE, ROW_IDLE } from '@/utils/styles';
import { IconChevronDown } from '@/components/common/icons';
import { Modal } from '@/components/common/Modal';
import { loadBenchmarkMeta, type BenchmarkMeta } from '@/utils/benchmarkMeta';
import { formatDateTime } from '@/utils/format';
import type { RunIndexEntry } from '@/types/benchmark';

interface BenchmarkPickerProps {
  entries: RunIndexEntry[];
  selectedId: string | null;
  // The selected benchmark's display name once its document has loaded, shown on the trigger in place of
  // the id. Null until the active document resolves, when the id stands in.
  selectedName: string | null;
  onSelect: (id: string) => void;
}

// The load state of one row's metadata, the id and url known from the index before the head resolves.
type MetaState =
  | { status: 'loading' }
  | { status: 'ready'; meta: BenchmarkMeta }
  | { status: 'error' };

// Benchmark time as a short local date and time, the run start the document carries.
const benchmarkAt = (ms: number | null): string =>
  ms == null
    ? '-'
    : formatDateTime(ms, { year: 'numeric', month: 'short', day: 'numeric' }, { hour: '2-digit', minute: '2-digit' });

// Loads every entry's metadata head once the picker is open, keyed by id. loadBenchmarkMeta caches per
// url, so reopening resolves from cache without another request.
function useBenchmarkMetas(entries: RunIndexEntry[], enabled: boolean): Record<string, MetaState> {
  const [metas, setMetas] = useState<Record<string, MetaState>>({});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    entries.forEach(entry => {
      setMetas(prev => {
        const existing = prev[entry.id];
        const keepPrior = existing != null && existing.status !== 'error';
        return keepPrior ? prev : { ...prev, [entry.id]: { status: 'loading' } };
      });
      loadBenchmarkMeta(entry.url)
        .then(meta => {
          if (!cancelled) setMetas(prev => ({ ...prev, [entry.id]: { status: 'ready', meta } }));
        })
        .catch(() => {
          if (!cancelled) setMetas(prev => ({ ...prev, [entry.id]: { status: 'error' } }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [entries, enabled]);
  return metas;
}

export function BenchmarkPicker({ entries, selectedId, selectedName, onSelect }: BenchmarkPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const metas = useBenchmarkMetas(entries, open);

  const choose = (id: string): void => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Select benchmark"
        className={cx(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/60',
          FOCUS_RING
        )}
      >
        <span className="truncate">{selectedName ?? selectedId ?? 'Select benchmark'}</span>
        <IconChevronDown className="shrink-0 text-faint" />
      </button>

      {open && (
        <Modal
          title="Select benchmark"
          ariaLabel="Select benchmark"
          onDismiss={() => setOpen(false)}
          closeLabel="Close benchmark picker"
          containerClassName="fixed inset-0 z-50 grid place-items-center p-6"
          panelClassName="flex max-h-[80vh] w-full max-w-[1100px] flex-col gap-3 overflow-hidden rounded-xl border border-border bg-elevated p-4 shadow-2xl"
          extraRefs={[triggerRef]}
        >
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className={cx('border-b border-border text-left', OVERLINE)}>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Name</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Description</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Benchmark at</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">zkVM</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Guest</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map(entry => {
                  const state = metas[entry.id];
                  const meta = state?.status === 'ready' ? state.meta : null;
                  const failed = state?.status === 'error';
                  const active = entry.id === selectedId;
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => choose(entry.id)}
                      aria-selected={active}
                      className={cx('cursor-pointer', ROW_BASE, active ? ROW_ACTIVE : ROW_IDLE)}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                        <PickerCell value={meta?.name} failed={failed} />
                      </td>
                      <td className="max-w-md truncate px-4 py-2.5 text-muted" title={meta?.description}>
                        <PickerCell value={meta?.description} failed={failed} muted />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">
                        {meta ? benchmarkAt(meta.startedAt) : <PickerCell value={undefined} failed={failed} muted />}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <PickerCell value={meta && `${meta.software.zkvm.name}@${meta.software.zkvm.version}`} failed={failed} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <PickerCell value={meta && `${meta.software.guest.name}@${meta.software.guest.version}`} failed={failed} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-faint">{entry.id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {entries.length === 0 && <p className="p-4 text-sm text-muted">No benchmarks found.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

// One metadata cell, a skeleton bar while the head loads, a dash on a failed read, and the value once
// present. The skeleton keeps a loading row from collapsing and reads as pending rather than empty.
function PickerCell({ value, failed, muted }: { value: string | null | undefined; failed?: boolean; muted?: boolean }) {
  if (value != null) return <span className={cx('truncate', muted && 'text-muted')}>{value}</span>;
  if (failed) return <span className="text-faint">-</span>;
  return <span className="inline-block h-3 w-16 animate-pulse rounded bg-border" aria-hidden="true" />;
}
