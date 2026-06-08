/* Block-name to log-archive path mapping shared by the frontend log loader and its build-time index. */

// Maps a block name to its flat archive file name, replacing the `::` of an EEST id with a double
// underscore and percent-encoding the result so brackets and spaces survive a static host. The colon is
// replaced rather than kept because a colon in a served path is not matched by the dev server or a
// static origin, which fall through to the SPA HTML fallback. Mirrors archive_stem in
// tools/src/parse_benchmark/output.rs and the scan in the logArchiveIndex Vite plugin
// (frontend/vite/logArchiveIndex.ts); all three address the same file and must change together.
export const blockArchivePath = (name: string): string =>
  encodeURIComponent(name.split('::').join('__'));

// Path of a block's log archive relative to the data/log root. This is both the key the build-time log
// archive index lists the file under and the suffix appended to the log base when fetching it, so the
// presence check and the request always resolve to the same path. The benchmark and run ids are
// encoded too, harmless for the timestamp-style ids in use and correct should one ever carry a reserved
// character.
export const archiveRelPath = (benchId: string, runId: string, blockName: string): string =>
  `${[benchId, runId].map(encodeURIComponent).join('/')}/${blockArchivePath(blockName)}.tar.json`;
