// Virtual module emitted by the logArchiveIndex Vite plugin in frontend/vite/logArchiveIndex.ts. It
// lists the per-block log archives bundled in this build as paths relative to the data/log root, each
// segment percent-encoded to match archiveRelPath in frontend/src/utils/archivePath.ts.
declare module 'virtual:log-archive-index' {
  const paths: readonly string[];
  export default paths;
}
