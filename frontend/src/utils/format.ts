/* Display formatters for numbers, durations, gas, and bytes. */

// Compact a large count into K/M/B with two significant decimals.
export function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)} K`;
  return String(n);
}

// Returns '-' for a nullish value, else the formatted value. The shared null-to-dash guard every stat
// and table cell uses instead of an inline `x == null ? '-' : f(x)` ternary.
export const dash = <T>(value: T | null | undefined, fmt: (v: T) => string): string =>
  value == null ? '-' : fmt(value);

// Seconds with a fixed precision and unit.
export const formatSeconds = (s: number, digits = 2): string => `${s.toFixed(digits)} s`;

// Milliseconds as a seconds string, or '-' when absent. The common formatter for the document's ms
// durations.
export const formatMsSeconds = (ms: number | null | undefined, digits = 2): string =>
  dash(ms, m => formatSeconds(msToSec(m), digits));

// PCIe throughput in MiB/s, promoted to GiB/s once it crosses 1024.
export const formatMiBps = (v: number): string =>
  v >= 1024 ? `${(v / 1024).toFixed(1)} GiB/s` : `${v.toFixed(0)} MiB/s`;

// Bytes into the largest sensible binary unit.
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 2)} ${units[unit]}`;
}

// Convert integer ms to seconds, the shared conversion charts use to place ms-offset windows and
// telemetry ticks on a seconds-since-start axis.
export const msToSec = (ms: number): number => ms / 1000;

// Axis label for a seconds-since-reference value. Always carries the second unit so a long run never
// reads as a wall clock, the comparison the seconds-since-origin axis exists to avoid.
export const formatAxisSeconds = (s: number): string => `${Math.round(s)}s`;

// A millisecond epoch as a local date then time joined with a space, the caller supplying its own Intl
// date and time options so precision matches the context. The raw ms value is returned verbatim when it
// does not parse, so an absent or malformed timestamp reads as its source not the literal Invalid Date.
export function formatDateTime(
  ms: number,
  dateOpts: Intl.DateTimeFormatOptions,
  timeOpts: Intl.DateTimeFormatOptions
): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  const date = d.toLocaleDateString('en-US', dateOpts);
  const time = d.toLocaleTimeString('en-US', timeOpts);
  return `${date} ${time}`;
}
