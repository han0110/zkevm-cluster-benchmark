/*
 * Builder for the ansible re-run command targeting a set of fixture ids, split from the copy control so
 * the quoting can be tested without rendering. The command drives the site playbook by naming the
 * benchmark, its guest, and the selected fixtures as JSON extra-vars, run from the deployment's ansible
 * directory.
 */

// POSIX single-quotes a string into one shell word, escaping an embedded single quote with the
// close-escape-reopen idiom. The fixtures payload is JSON, so wrapping it survives any id. Double quotes
// and backslashes are already JSON-escaped and stay literal inside single quotes, and a single quote in
// an id is the only character this wrapping must escape for the shell.
const shQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

// Builds the ansible re-run command for the selected fixture ids. When allSelected is set every block is
// shown, so the command carries no benchmark_fixtures filter and the playbook runs the whole benchmark by
// default. Otherwise the ids travel through JSON.stringify (JSON escaping) wrapped in shQuote (shell
// single-quote escaping), so an id with single quotes, double quotes, spaces, or a backslash survives both
// the shell word-split and the ansible JSON parse unchanged.
export function buildReRunCommand(benchId: string, guest: string, ids: string[], allSelected: boolean): string {
  if (allSelected) {
    return ['ansible-playbook site.yml \\', `    -e benchmark_name=${benchId} \\`, `    -e benchmark_guest=${guest}`].join(
      '\n'
    );
  }
  const fixtures = `{"benchmark_fixtures": ${JSON.stringify(ids)}}`;
  return [
    'ansible-playbook site.yml \\',
    `    -e benchmark_name=${benchId} \\`,
    `    -e benchmark_guest=${guest} \\`,
    `    -e ${shQuote(fixtures)}`,
  ].join('\n');
}
