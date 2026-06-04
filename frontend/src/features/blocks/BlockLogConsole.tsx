/*
 * Log console for a block's proving window. Lists the role-tagged coordinator and worker lines in time
 * order, filterable by level, by role, and by include/exclude regex. The parser captures every level,
 * so a block can carry thousands of lines. The list is windowed to render only the visible slice.
 * Levels and roles are selected sets where an empty set shows all, matching the blocks-table filter,
 * and the regex inputs are debounced so typing never re-scans the whole log mid-keystroke. Hovering a
 * line reports its time so the trace draws a cursor at that moment.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMeasuredRowWindow } from '@/hooks/useMeasuredRowWindow';
import { useCopyFeedback } from '@/hooks/useCopyFeedback';
import { Field } from '@/components/common/Field';
import { EmptyState } from '@/components/common/EmptyState';
import { ChipRow } from '@/components/common/ChipToggle';
import { usePopover } from '@/hooks/usePopover';
import { PopoverPanel } from '@/components/common/Popover';
import { IconFilter, IconFilterOff } from '@/components/common/icons';
import { cx } from '@/utils/cx';
import { ACTIVE_ACCENT, FOCUS_RING, ICON_BUTTON, ICON_BUTTON_COLOR, ICON_BUTTON_SM, PILL, PILL_IDLE } from '@/utils/styles';
import { formatMicros } from '@/utils/format';
import { INFO_LEVELS, LEVELS, formatLogs, levelOf } from '@/features/blocks/logFormat';
import type { LogEntry } from '@/types/benchmark';

// Height in px of a single unwrapped row, the windowing estimate every row starts at until its true
// wrapped height is measured. It matches the row's leading-5 line box plus its py-1 padding.
const ESTIMATED_ROW_HEIGHT = 28;
// Debounce for the regex inputs, so a keystroke does not re-scan thousands of lines until typing settles.
const FILTER_DEBOUNCE_MS = 180;

// Level text color cue, sharing the success/warning/danger palette so a level reads at a glance, with
// the quiet levels dimmed.
const levelColor = (level: string): string =>
  level === 'error'
    ? 'text-danger'
    : level === 'warn'
      ? 'text-warning'
      : level === 'debug' || level === 'trace'
        ? 'text-faint'
        : 'text-muted';

// Toggles a key's presence in a selected-set, the chip model where an empty set shows everything.
const toggled = (set: Set<string>, key: string): Set<string> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

// Compiles a case-insensitive regex, or null when empty or invalid, so a half-typed pattern never
// throws and simply matches nothing until it parses.
const compile = (pattern: string): RegExp | null => {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
};

// The value after it has held steady for the delay, so the filter recomputes once typing settles.
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function BlockLogConsole({
  logs,
  onHoverLog,
  empty,
}: {
  logs: LogEntry[];
  // Reports the microsecond time of the hovered line, or null when the cursor leaves the console, so
  // the trace can draw a cursor line at that moment.
  onHoverLog?: (timeUs: number | null) => void;
  // The note shown in the list area when no lines remain, the caller's loading, absent, or failure
  // message, falling back to a plain empty note. The filter bar stays visible regardless, so the
  // console reads the same when a block carries no logs.
  empty?: ReactNode;
}) {
  // Selected sets, empty meaning all shown. The console opens on the Info preset, the signal levels and
  // every role, and the selection persists as the open block changes so navigating between blocks never
  // resets a filter the reader set.
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(() => new Set(INFO_LEVELS));
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');

  // The role chips span the union of the current block's roles and any still-selected role, so a role
  // selected on an earlier block that this block never emits keeps a clearable chip rather than silently
  // hiding every line with no control to release it. The order stays stable through a sort.
  const roles = useMemo(
    () => [...new Set([...logs.map(l => l.role), ...selectedRoles])].sort(),
    [logs, selectedRoles]
  );

  const { open, toggle, triggerRef, panelRef } = usePopover();

  const debouncedInclude = useDebounced(include, FILTER_DEBOUNCE_MS);
  const debouncedExclude = useDebounced(exclude, FILTER_DEBOUNCE_MS);
  const includeRe = useMemo(() => compile(debouncedInclude), [debouncedInclude]);
  const excludeRe = useMemo(() => compile(debouncedExclude), [debouncedExclude]);
  const includeInvalid = include !== '' && compile(include) === null;
  const excludeInvalid = exclude !== '' && compile(exclude) === null;

  const shown = useMemo(
    () =>
      logs.filter(l => {
        if (selectedLevels.size > 0 && !selectedLevels.has(levelOf(l.level))) return false;
        if (selectedRoles.size > 0 && !selectedRoles.has(l.role)) return false;
        if (includeRe && !includeRe.test(l.msg)) return false;
        if (excludeRe && excludeRe.test(l.msg)) return false;
        return true;
      }),
    [logs, selectedLevels, selectedRoles, includeRe, excludeRe]
  );

  // Presets over the selected sets. Info selects the loud levels and every role. All selects nothing,
  // showing every level and role.
  const applyInfo = (): void => {
    setSelectedLevels(new Set(INFO_LEVELS));
    setSelectedRoles(new Set());
  };
  const applyAll = (): void => {
    setSelectedLevels(new Set());
    setSelectedRoles(new Set());
  };
  const clear = (): void => {
    applyInfo();
    setInclude('');
    setExclude('');
  };
  const isAll = selectedLevels.size === 0 && selectedRoles.size === 0;
  const isInfo =
    selectedRoles.size === 0 &&
    selectedLevels.size === INFO_LEVELS.length &&
    INFO_LEVELS.every(l => selectedLevels.has(l));
  // A filter applies whenever a level or role chip is selected or a regex is set, so the Filter control
  // lights for the Info preset too, since that selects the signal levels and hides the rest. Only the
  // All preset, which selects nothing, reads as no filter.
  const filtering = selectedLevels.size > 0 || selectedRoles.size > 0 || include !== '' || exclude !== '';
  // Whether the selection differs from the opening Info preset, the condition the Clear control shows
  // under, so Clear appears only when there is something to reset.
  const customized = !isInfo || include !== '' || exclude !== '';

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  // The reset signature changes whenever the filtered list does, so a measured height is never reused
  // for a row that a new filter has replaced with different content at the same index.
  const filterKey = `${logs.length}|${[...selectedLevels].sort().join(',')}|${[...selectedRoles].sort().join(',')}|${debouncedInclude}|${debouncedExclude}`;
  const { start, end, padTop, padBottom } = useMeasuredRowWindow({
    scrollRef,
    innerRef,
    count: shown.length,
    estimate: ESTIMATED_ROW_HEIGHT,
    resetKey: filterKey,
  });
  const slice = shown.slice(start, end);

  // A changed block resets the scroll to the first line, so a navigated-to block opens at its start
  // rather than the previous block's offset while the filter selection carries over.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [logs]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={isInfo} onClick={applyInfo} className={cx(PILL, FOCUS_RING, isInfo ? ACTIVE_ACCENT : PILL_IDLE)}>
          Info
        </button>
        <button type="button" aria-pressed={isAll} onClick={applyAll} className={cx(PILL, FOCUS_RING, isAll ? ACTIVE_ACCENT : PILL_IDLE)}>
          All
        </button>

        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={cx(PILL, FOCUS_RING, filtering ? 'border-primary text-foreground' : PILL_IDLE)}
          >
            Filter
          </button>
          {open && (
            <PopoverPanel panelRef={panelRef} className="w-80">
              <div className="flex flex-col gap-4">
                <Field label="Level">
                  <ChipRow
                    items={LEVELS}
                    isSelected={level => selectedLevels.has(level)}
                    onToggle={level => setSelectedLevels(prev => toggled(prev, level))}
                    getKey={level => level}
                    getLabel={level => <span className="capitalize">{level}</span>}
                  />
                </Field>
                <Field label="Role">
                  <ChipRow
                    items={roles}
                    isSelected={role => selectedRoles.has(role)}
                    onToggle={role => setSelectedRoles(prev => toggled(prev, role))}
                    getKey={role => role}
                    getLabel={role => role}
                  />
                </Field>
                <Field label="Filter">
                  <FilterInput
                    value={include}
                    onChange={setInclude}
                    invalid={includeInvalid}
                    placeholder="include  e.g. error|prove"
                    icon={<IconFilter className="text-success" />}
                  />
                  <FilterInput
                    value={exclude}
                    onChange={setExclude}
                    invalid={excludeInvalid}
                    placeholder="exclude  e.g. received|h2"
                    icon={<IconFilterOff className="text-danger" />}
                  />
                </Field>
              </div>
            </PopoverPanel>
          )}
        </div>

        {customized && (
          <button
            type="button"
            onClick={clear}
            className={cx('rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-foreground', FOCUS_RING)}
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted tabular-nums">
            {shown.length} of {logs.length}
          </span>
          <CopyLogsButton rows={shown} />
        </div>
      </div>
      <div
        ref={scrollRef}
        onMouseLeave={() => onHoverLog?.(null)}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface font-mono text-xs"
      >
        {shown.length === 0 ? (
          <div className="flex h-full min-h-0 items-center justify-center p-6 font-sans">
            {empty ?? <EmptyState tone="faint">No log lines.</EmptyState>}
          </div>
        ) : (
          <div ref={innerRef} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {slice.map((line, i) => {
              const index = start + i;
              return (
                <div
                  key={index}
                  data-measured-row={index}
                  onMouseEnter={() => onHoverLog?.(line.time)}
                  className="flex items-start gap-3 px-3 py-1 leading-5 hover:bg-primary/10"
                >
                  <span className="w-20 shrink-0 text-right tabular-nums text-faint">{formatMicros(line.time)} s</span>
                  <span className="w-24 shrink-0 truncate text-primary">{line.role}</span>
                  <span className={cx('w-16 shrink-0 uppercase', levelColor(levelOf(line.level)))}>{levelOf(line.level)}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground" title={line.msg}>
                    {line.msg}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Copies the shown log lines as aligned text, the label briefly reflecting the outcome to match the
// re-run command control. The control is disabled when no line is shown.
function CopyLogsButton({ rows }: { rows: LogEntry[] }) {
  const { state, copy } = useCopyFeedback();
  const onCopy = async (): Promise<void> => {
    await copy(formatLogs(rows));
  };
  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy';
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={rows.length === 0}
      title="Copy the shown log lines as aligned text"
      className={cx(PILL, FOCUS_RING, PILL_IDLE, rows.length === 0 && 'cursor-not-allowed opacity-50')}
    >
      {label}
    </button>
  );
}

// One regex input with a leading tint icon, a red border while the pattern is invalid, and a clear
// control that appears once it carries text.
function FilterInput({
  value,
  onChange,
  invalid,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  placeholder: string;
  icon: ReactNode;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">{icon}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cx(
          'w-full rounded-md border bg-surface py-1 pl-8 pr-7 font-mono text-xs text-foreground placeholder:text-faint',
          FOCUS_RING,
          invalid ? 'border-danger' : 'border-border'
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear"
          className={cx(ICON_BUTTON, ICON_BUTTON_COLOR, ICON_BUTTON_SM, 'absolute right-1.5 top-1/2 -translate-y-1/2', FOCUS_RING)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
