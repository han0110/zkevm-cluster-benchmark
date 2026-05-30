/*
 * Proofs page, a master-detail split of the proofs table and a proof detail panel. The open proof lives
 * at /proofs/{run_index}/{proof_id} since an id can recur across runs. Wiring is useMasterDetailRoute.
 */

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useBench } from '@/hooks/useBench';
import { useMasterDetailRoute } from '@/hooks/useMasterDetailRoute';
import { runByIndex } from '@/utils/runs';
import { ResizableSplit } from '@/components/layout/ResizableSplit';
import { ProofsTable } from '@/features/proofs/ProofsTable';
import { ProofDetail } from '@/features/proofs/ProofDetail';

export function ProofsPage() {
  const bench = useBench();
  const { runIdx, proofId } = useParams();

  // Proofs ordered by block start within their run, the order the arrow keys step through.
  const ordered = useMemo(() => {
    const run = runByIndex(bench, runIdx);
    return run ? [...run.blocks].sort((a, b) => a.start_ms - b.start_ms) : [];
  }, [bench, runIdx]);

  const { run, selected, activeKey, onClose } = useMasterDetailRoute({
    itemParam: proofId,
    items: ordered,
    idOf: b => b.id,
    basePath: '/proofs',
  });

  return (
    <ResizableSplit
      storageKey="proofs-panel-fraction"
      resizeLabel="Resize proof detail"
      left={<ProofsTable activeKey={activeKey} />}
      right={run && selected ? <ProofDetail run={run} block={selected} onClose={onClose} /> : null}
    />
  );
}
