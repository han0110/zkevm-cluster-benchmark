/*
 * Copy-to-clipboard control for an ansible re-run command targeting the blocks the filters currently
 * show, so narrowing the table builds a command that re-runs exactly that set. With every block shown the
 * command drops its fixtures filter and its count, since the playbook then runs the whole benchmark.
 */

import { cx } from '@/utils/cx';
import { FOCUS_RING, PILL } from '@/utils/styles';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { buildReRunCommand } from '@/features/blocks/reRunCommand';
import type { Block } from '@/types/benchmark';

export function ReRunCommand({
  benchId,
  guest,
  blocks,
  allSelected,
}: {
  benchId: string;
  guest: string;
  blocks: Block[];
  allSelected: boolean;
}) {
  const { state, copy } = useCopyFeedback();

  const onCopy = async (): Promise<void> => {
    await copy(buildReRunCommand(benchId, guest, blocks.map(b => b.name), allSelected));
  };

  // The count is shown only when the set is narrowed, since an all-blocks command names no explicit set.
  const idleLabel = allSelected ? 'Copy re-run command' : `Copy re-run command (${blocks.length})`;
  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : idleLabel;

  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copy the ansible command that re-runs the blocks currently shown by the filters"
      className={cx(
        PILL,
        FOCUS_RING,
        state === 'failed'
          ? 'border-danger/60 text-danger hover:border-danger'
          : 'border-warning/60 text-warning hover:border-warning hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
