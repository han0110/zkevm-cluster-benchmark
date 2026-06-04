/* Block-name to log-archive path mapping shared by the frontend log loader. */

// Mirrors archive_stem in tools/src/parse_benchmark/output.rs and both sides must change together.
export const blockArchivePath = (name: string): string =>
  name.split('::').map(encodeURIComponent).join('/');
