/*
 * Per-node proving trace for a block, the Gantt of its phase windows. A block that reached no node
 * progress carries no windows, so its nodes render as hatched 'did not participate' bands rather than
 * empty rows, keeping the trace shape the same across blocks and across the inline detail and the
 * fullscreen overlay, including when keyboard navigation lands on such a block while the overlay is open.
 */

import { useMemo } from 'react';
import { Gantt } from '@/components/charts/Gantt';
import { hasTimeline } from '@/utils/phaseTimings';
import type { PhaseRegistry } from '@/utils/phases';
import type { Block } from '@/types/benchmark';

export function BlockTrace({
  block,
  nodes,
  registry,
  height,
  cursorSec,
}: {
  block: Block;
  nodes: string[];
  registry: PhaseRegistry;
  height?: number;
  cursorSec?: number | null;
}) {
  // A block with no timeline has no node windows, so every node is shown as absent and the Gantt draws a
  // hatched band per node spanning the row rather than an empty row. Memoized on the block so a
  // cursor-only re-render reuses the prior value rather than re-cloning every node.
  const shown = useMemo(
    () =>
      hasTimeline(block)
        ? block
        : { ...block, nodes: block.nodes.map(node => ({ ...node, participated: false })) },
    [block]
  );
  return <Gantt block={shown} nodes={nodes} registry={registry} height={height} cursorSec={cursorSec} />;
}
