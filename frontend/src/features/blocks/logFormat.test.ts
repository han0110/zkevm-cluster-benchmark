import { describe, it, expect } from 'vitest';
import { formatLogs, levelOf } from '@/features/blocks/logFormat';
import type { LogEntry } from '@/types/benchmark';

describe('formatLogs', () => {
  it('left-aligns time, role, and level padded to each column width, with the level upper-cased', () => {
    const rows: LogEntry[] = [
      { role: 'coordinator', time: 19_000, level: 'info', msg: '[Phase1] Started' },
      { role: 'worker1', time: 23_000, level: 'info', msg: 'Starting Partial Contribution' },
      { role: 'worker1', time: 23_000, level: 'error', msg: 'Initializing publics custom_commits' },
    ];
    expect(formatLogs(rows).split('\n')).toEqual([
      '0.019  coordinator  INFO   [Phase1] Started',
      '0.023  worker1      INFO   Starting Partial Contribution',
      '0.023  worker1      ERROR  Initializing publics custom_commits',
    ]);
  });

  it('renders microsecond times as seconds to the millisecond', () => {
    const rows: LogEntry[] = [{ role: 'c', time: 1_500_000, level: 'warn', msg: 'm' }];
    expect(formatLogs(rows)).toBe('1.500  c  WARN  m');
  });
});

describe('levelOf', () => {
  it('keeps a known level and defaults anything else to debug', () => {
    expect(levelOf('warn')).toBe('warn');
    expect(levelOf('trace')).toBe('trace');
    expect(levelOf('')).toBe('debug');
    expect(levelOf('other')).toBe('debug');
  });
});
