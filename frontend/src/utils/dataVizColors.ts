/*
 * Node color resolution and shared categorical palette. Colors defined once in index.css resolve to hex
 * here (cached) so ECharts options consume them directly. Phase identity/labels/colors live in the
 * per-run phase registry (utils/phases.ts), telemetry metric descriptors live in the data.
 */

import { resolveCssColorToHex } from '@/utils/color';

const resolveVar = (name: string): string => resolveCssColorToHex(`var(${name})`);

// Index a non-empty array by wrapping so a cyclic palette lookup always returns an element. The
// assertion is safe because the wrapped index is always in bounds for a non-empty array.
export const cyclic = <T>(arr: readonly T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length] as T;

interface DataVizColors {
  nodes: readonly string[];
  categorical: readonly string[];
}

// Cache assumes one static theme for the page lifetime. A theme toggle would reset this before reading
// colors again. Resolution stays deferred so it never reads CSS variables at import time.
let cached: DataVizColors | null = null;

export function getDataVizColors(): DataVizColors {
  if (cached) return cached;
  cached = {
    nodes: [
      resolveVar('--color-node-1'),
      resolveVar('--color-node-2'),
      resolveVar('--color-node-3'),
      resolveVar('--color-node-4'),
    ],
    categorical: Array.from({ length: 8 }, (_, i) => resolveVar(`--color-cat-${i + 1}`)),
  };
  return cached;
}

// 1-based node number from an id like "node3", clamped to at least 1 so digitless ids still map to a
// valid palette entry.
const nodeDigit = (id: string): number => Math.max(1, Number(id.replace(/\D/g, '')) || 1);

// Color for a node by its id, cycling the node palette by the id's 1-based number.
export function nodeColorById(id: string): string {
  const { nodes } = getDataVizColors();
  return cyclic(nodes, nodeDigit(id) - 1);
}

// Per-GPU dash patterns, the cue distinguishing a node's GPUs when they share a node color on the
// combined chart. Index 0 is solid so the first GPU reads cleanly.
export const GPU_DASH: ReadonlyArray<number | number[]> = [0, [7, 4], [2, 3], [9, 3, 2, 3]];
