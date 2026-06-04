/*
 * Log-level vocabulary and the copy formatting for the block log console. Levels are the fixed
 * trace/debug/info/warn/error set the parser guarantees, with any stray value normalized to debug, so
 * the filter chips and the copied text read the same regardless of a block's recorded levels.
 */

import { formatMicros } from '@/utils/format';
import type { LogEntry } from '@/types/benchmark';

// The log levels, fixed so the filter row reads the same across blocks. The parser emits only these.
export const LEVELS = ['trace', 'debug', 'info', 'warn', 'error'];

// The levels the Info preset selects, the signal levels with the high-volume trace and debug left out.
export const INFO_LEVELS = ['info', 'warn', 'error'];

const LEVEL_SET = new Set(LEVELS);

// A line's level normalized into the fixed set, defaulting an unknown value to debug so a stray level
// from an older archive still groups, colors, and copies sensibly.
export const levelOf = (level: string): string => (LEVEL_SET.has(level) ? level : 'debug');

// The given log lines as left-aligned columns, each of time, role, and level padded to its widest value
// so a pasted log reads as an aligned table. Time is seconds to the millisecond, the level is
// upper-cased, and the message trails unpadded.
export function formatLogs(rows: LogEntry[]): string {
  const cells = rows.map(l => ({
    time: formatMicros(l.time),
    role: l.role,
    level: levelOf(l.level).toUpperCase(),
    msg: l.msg,
  }));
  const width = (key: 'time' | 'role' | 'level'): number => Math.max(0, ...cells.map(c => c[key].length));
  const w = { time: width('time'), role: width('role'), level: width('level') };
  return cells
    .map(c => [c.time.padEnd(w.time), c.role.padEnd(w.role), c.level.padEnd(w.level), c.msg].join('  '))
    .join('\n');
}
