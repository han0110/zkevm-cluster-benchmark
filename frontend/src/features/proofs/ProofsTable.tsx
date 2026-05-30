/*
 * Merged proofs table, one row per block per run, defaulting to each block's latest attempt so a patched
 * benchmark reads as one result. An id links to the detail panel, a filtered set drives the re-run copy.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useRunSearch } from '@/hooks/useRunSearch';
import { DataTable, type DataColumn } from '@/components/common/DataTable';
import { runColumn } from '@/components/common/gpuColumns';
import { ProportionBar } from '@/components/common/ProportionBar';
import { Truncated } from '@/components/common/Truncated';
import { cx } from '@/utils/cx';
import { FOCUS_RING } from '@/utils/styles';
import { blockLabel, buildPhaseRegistry, type PhaseRegistry } from '@/utils/phases';
import { phaseMixSegments, proofOverviewFields } from '@/features/proofs/proofOverview';
import { ProofsFilters } from '@/features/proofs/ProofsFilters';
import { ReRunCommand } from '@/features/proofs/ReRunCommand';
import {
  defaultFilters,
  filterProofs,
  proofBounds,
  statusColor,
  statusLabel,
  type ProofFilters,
  type ProofRow,
} from '@/features/proofs/proofFilters';
import type { Benchmark, Block } from '@/types/benchmark';

// Proving time paired with a phase-mix bar. Fixed-width track and column align bars and figures down the
// column. The bar scales against the slowest proof.
function ProvingTimeCell({
  block,
  registry,
  maxProvingMs,
  text,
}: {
  block: Block;
  registry: PhaseRegistry;
  maxProvingMs: number;
  text: string;
}) {
  const widthPct = maxProvingMs > 0 && block.proving_ms != null ? (block.proving_ms / maxProvingMs) * 100 : 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-right tabular-nums">{text}</span>
      <div className="w-28 shrink-0">
        {block.status === 'success' && (
          <div style={{ width: `${widthPct}%` }}>
            <ProportionBar segments={phaseMixSegments(block, registry)} />
          </div>
        )}
      </div>
    </div>
  );
}

// Merged rows across every run, each block tagged with its run and latest-attempt flag. The latest
// attempt is the one from the latest-started run holding the block, so a patch supersedes earlier ones.
function buildProofRows(bench: Benchmark): ProofRow[] {
  const latestRunIndex = new Map<string, number>();
  const latestStart = new Map<string, number>();
  bench.runs.forEach((run, ri) => {
    for (const block of run.blocks) {
      const prev = latestStart.get(block.id);
      if (prev == null || run.started_at > prev) {
        latestStart.set(block.id, run.started_at);
        latestRunIndex.set(block.id, ri);
      }
    }
  });
  return bench.runs.flatMap((run, ri) =>
    run.blocks.map(block => ({ block, runIndex: ri, runId: run.id, isLatest: latestRunIndex.get(block.id) === ri }))
  );
}

// Composite row key, unique because one block id can recur across runs. Matches the page's active key so
// the open proof's row highlights.
const rowKeyOf = (r: ProofRow): string => `${r.runIndex}/${r.block.id}`;

export function ProofsTable({ activeKey }: { activeKey?: string }) {
  const bench = useBench();
  const search = useRunSearch();
  const registry = useMemo(() => buildPhaseRegistry(bench), [bench]);

  const allRows = useMemo(() => buildProofRows(bench), [bench]);

  // The slowest successful proof sets the full-length bar, so the scale holds steady whichever runs the
  // filters leave visible.
  const maxProvingMs = useMemo(
    () => allRows.reduce((m, r) => (r.block.proving_ms != null && r.block.proving_ms > m ? r.block.proving_ms : m), 0),
    [allRows]
  );

  const bounds = useMemo(() => proofBounds(allRows.map(r => r.block), bench.hardware.nodes.length), [allRows, bench.hardware.nodes.length]);
  const [filters, setFilters] = useState<ProofFilters>(() => defaultFilters(bounds));
  // Reset to the latest-attempt default when the bounds change with the benchmark.
  useEffect(() => setFilters(defaultFilters(bounds)), [bounds]);
  const rows = useMemo(() => filterProofs(allRows, filters, bounds), [allRows, filters, bounds]);

  // A re-run targets the blocks the filters currently show, so narrowing the table curates the set.
  const reRunBlocks = useMemo(() => rows.map(r => r.block), [rows]);

  // Columns lead with id, proving time, status, then the shared overview fields, run index, and latest
  // flag. Proving time keeps the shared sort value but renders the phase-mix bar.
  const columns = useMemo<DataColumn<ProofRow>[]>(() => {
    const fields = proofOverviewFields();
    const time = fields.find(f => f.key === 'time');
    const rest = fields.filter(f => f.key !== 'time');
    return [
      {
        key: 'id',
        // The id has no natural width bound, so it starts compact and the reader widens it to see a long
        // id in full.
        width: 352,
        header: 'ID',
        render: r => (
          <Link
            to={{ pathname: `/proofs/${r.runIndex}/${encodeURIComponent(r.block.id)}`, search }}
            className={cx('flex w-full min-w-0 rounded-sm font-medium text-primary hover:underline', FOCUS_RING)}
          >
            <Truncated text={blockLabel(r.block)} />
          </Link>
        ),
        // Ids sort lexically, keeping a fixture's variants together and ordering zero-padded block ids
        // numerically.
        sortValue: r => r.block.id,
      },
      ...(time
        ? [
            {
              key: 'time',
              header: time.label,
              render: (r: ProofRow) => (
                <ProvingTimeCell block={r.block} registry={registry} maxProvingMs={maxProvingMs} text={time.render(r.block, registry)} />
              ),
              sortValue: (r: ProofRow) => time.sortValue(r.block, registry),
            },
          ]
        : []),
      {
        key: 'status',
        header: 'Status',
        render: r => <span className={cx('font-medium', statusColor(r.block.status))}>{statusLabel(r.block.status)}</span>,
      },
      ...rest.map(f => ({
        key: f.key,
        header: f.label,
        render: (r: ProofRow) => f.render(r.block, registry),
        sortValue: (r: ProofRow) => f.sortValue(r.block, registry),
      })),
      // Run index identifies the source run, the run id reading on hover.
      runColumn<ProofRow>(),
      {
        key: 'is_latest',
        header: 'Latest',
        render: r => <span className={r.isLatest ? 'text-success' : 'text-muted'}>{r.isLatest ? 'Yes' : 'No'}</span>,
        sortValue: r => (r.isLatest ? 1 : 0),
      },
    ];
  }, [search, registry, maxProvingMs]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ProofsFilters filters={filters} onChange={setFilters} bounds={bounds} shown={rows.length} total={allRows.length} />
        {reRunBlocks.length > 0 && <ReRunCommand benchId={bench.id} guest={bench.software.guest.name} blocks={reRunBlocks} />}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKeyOf}
        activeRowKey={activeKey}
        initialSort={{ key: 'id', dir: 'asc' }}
        // Scope persisted widths per benchmark so a long-id benchmark keeps its wide id column.
        tableId={`proofs:${bench.id}`}
        className="min-h-0 flex-1 overflow-y-auto"
      />
    </div>
  );
}
