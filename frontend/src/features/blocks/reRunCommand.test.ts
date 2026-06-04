import { describe, it, expect } from 'vitest';
import { buildReRunCommand } from '@/features/blocks/reRunCommand';

// A faithful POSIX shell word tokenizer. Outside single quotes a backslash escapes the next character and
// a backslash-newline is a line continuation, while inside single quotes every character is literal until
// the next single quote. It knows nothing about how the command was built, so feeding it the command and
// JSON-parsing the resulting argument verifies the command really survives a shell and the ansible parse.
function shellTokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let started = false;
  let inSingle = false;
  let i = 0;
  const push = (): void => {
    if (started) {
      tokens.push(cur);
      cur = '';
      started = false;
    }
  };
  while (i < cmd.length) {
    const c = cmd[i]!;
    if (inSingle) {
      if (c === "'") inSingle = false;
      else {
        cur += c;
        started = true;
      }
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      started = true;
      i++;
      continue;
    }
    if (c === '\\') {
      const next = cmd[i + 1];
      if (next === '\n') i += 2;
      else if (next !== undefined) {
        cur += next;
        started = true;
        i += 2;
      } else i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n') {
      push();
      i++;
      continue;
    }
    cur += c;
    started = true;
    i++;
  }
  push();
  return tokens;
}

describe('buildReRunCommand', () => {
  it('quotes ids so a single quote, space, double quote, and backslash survive the shell and JSON parse', () => {
    const ids = ['plain', 'with space', "with'quote", 'with"double', 'back\\slash', "tricky' \"id"];
    const argv = shellTokenize(buildReRunCommand('bench-name', 'reth', ids, false));

    expect(argv).toContain('benchmark_name=bench-name');
    expect(argv).toContain('benchmark_guest=reth');

    const jsonArg = argv.find(a => a.startsWith('{') && a.includes('benchmark_fixtures'));
    expect(jsonArg).toBeDefined();
    const parsed = JSON.parse(jsonArg!) as { benchmark_fixtures: string[] };
    // Every id round-trips byte-for-byte through the shell word-split and the JSON parse.
    expect(parsed.benchmark_fixtures).toEqual(ids);
  });

  it('omits the fixtures filter when every block is selected, so the playbook runs them all', () => {
    const argv = shellTokenize(buildReRunCommand('bench-name', 'reth', ['a', 'b'], true));
    expect(argv).toContain('benchmark_name=bench-name');
    expect(argv).toContain('benchmark_guest=reth');
    // No benchmark_fixtures extra-var is emitted, so the run is not narrowed to a subset.
    expect(argv.some(a => a.includes('benchmark_fixtures'))).toBe(false);
  });
});
