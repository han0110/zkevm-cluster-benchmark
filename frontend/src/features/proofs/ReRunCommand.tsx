/*
 * Copy-to-clipboard control for an ansible re-run command targeting the fixtures the proofs filters
 * currently show, so narrowing the table builds a command that re-runs exactly that set.
 */

import { useState } from 'react';
import { cx } from '@/utils/cx';
import { FOCUS_RING, PILL } from '@/utils/styles';
import { copyToClipboard } from '@/utils/clipboard';
import type { Block } from '@/types/benchmark';

// POSIX single-quotes a string into one shell word, escaping an embedded single quote with the
// close-escape-reopen idiom. The fixtures payload is JSON so only its single quotes need escaping.
const shQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

// Builds the ansible re-run command for the selected fixtures.
function buildReRunCommand(benchId: string, guest: string, blocks: Block[]): string {
  const ids = blocks.map(b => b.id);
  const fixtures = `{"benchmark_fixtures": ${JSON.stringify(ids)}}`;
  return [
    'ansible-playbook site.yml \\',
    `    -e benchmark_name=${benchId} \\`,
    `    -e benchmark_guest=${guest} \\`,
    `    -e ${shQuote(fixtures)}`,
  ].join('\n');
}

export function ReRunCommand({ benchId, guest, blocks }: { benchId: string; guest: string; blocks: Block[] }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const onCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(buildReRunCommand(benchId, guest, blocks));
    setState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setState('idle'), 2000);
  };

  const label =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : `Copy re-run command (${blocks.length})`;

  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copy the ansible command that re-runs the proofs currently shown by the filters"
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
