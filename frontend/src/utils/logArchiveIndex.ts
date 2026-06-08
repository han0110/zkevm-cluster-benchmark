/*
 * Build-time view of which blocks ship a log archive in this build. The logArchiveIndex Vite plugin in
 * frontend/vite/logArchiveIndex.ts lists every archive under data/log as a percent-encoded path relative
 * to that root, gathered here into a set the loader consults before fetching. A block whose archive is
 * absent from the set is reported as having no logs in this build without a network request, so a build
 * that bundled no archives, such as the public deployment where the tree is gitignored, issues no log
 * requests at all rather than one failing fetch per block.
 */

import archivePaths from 'virtual:log-archive-index';
import { archiveRelPath } from '@/utils/archivePath';

const available: ReadonlySet<string> = new Set(archivePaths);

// Whether this build bundled the given block's log archive.
export const hasLogArchive = (benchId: string, runId: string, blockName: string): boolean =>
  available.has(archiveRelPath(benchId, runId, blockName));
