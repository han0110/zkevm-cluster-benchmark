import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Emits a virtual module listing the per-block log archives present under data/log, so the frontend
// knows at build time which blocks ship an archive in this build and skips the network request for the
// rest. Each file is listed as its path relative to data/log with every segment percent-encoded, the
// exact form archiveRelPath in src/utils/archivePath.ts looks up and fetches, so the two must change
// together. The archive tree is gitignored, so a build that bundled no logs, such as the public Pages
// deployment, yields an empty index and issues no log requests. A build or test run scans the tree once;
// the dev server additionally watches data/log and reloads the page when archives are written or removed,
// so logs surface as soon as a benchmark is parsed without restarting the server. It is shared by
// vite.config.ts and vitest.config.ts so the same import resolves in dev, build, and test.
export function logArchiveIndex(): Plugin {
  const virtualId = 'virtual:log-archive-index';
  const resolvedId = `\0${virtualId}`;
  const logDir = fileURLToPath(new URL('../data/log', import.meta.url));
  const collect = (dir: string, prefix: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const segment = encodeURIComponent(entry.name);
      const rel = prefix ? `${prefix}/${segment}` : segment;
      if (entry.isDirectory()) return collect(path.join(dir, entry.name), rel);
      return entry.name.endsWith('.tar.json') ? [rel] : [];
    });
  return {
    name: 'log-archive-index',
    resolveId(id) {
      return id === virtualId ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return undefined;
      const paths = fs.existsSync(logDir) ? collect(logDir, '') : [];
      return `export default ${JSON.stringify(paths)};`;
    },
    configureServer(server) {
      // The index is computed in load() and cached for the dev session, so a freshly written archive is
      // invisible until the cached module is dropped. Watching data/log invalidates the virtual module
      // and reloads the page when a .tar.json appears or disappears. Events are debounced so a parse run
      // writing many files triggers one reload, and the parent is watched when the tree does not exist
      // yet so the first archive is still caught.
      const watchTarget = fs.existsSync(logDir) ? logDir : path.dirname(logDir);
      server.watcher.add(watchTarget);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = (file: string): void => {
        if (!file.endsWith('.tar.json')) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const mod = server.moduleGraph.getModuleById(resolvedId);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }, 100);
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}
