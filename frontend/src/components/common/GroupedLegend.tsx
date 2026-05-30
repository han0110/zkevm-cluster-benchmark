/*
 * Selectable grouped legend as multi-group pills. Each group is one identity dimension (Node, GPU).
 * Toggling a pill flips that key in the group's selected set, and the chart shows a series only when
 * every dimension it belongs to is selected. A pill renders a colored dot, or a dash swatch when a dash
 * pattern is supplied, so a line-style dimension stays readable in the legend.
 */

import { cx } from '@/utils/cx';
import { FOCUS_RING, OVERLINE, SWATCH_DOT } from '@/utils/styles';

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  dash?: number | number[];
}

export interface LegendGroup {
  name?: string;
  items: LegendItem[];
  selected: Set<string>;
  // True when the click held Cmd or Ctrl, so the consumer multi-selects Grafana-style where a plain
  // click isolates and a modifier click toggles one item.
  onToggle: (key: string, multi: boolean) => void;
}

function Swatch({ color, dash, active }: { color: string; dash?: number | number[]; active: boolean }) {
  const opacity = active ? 1 : 0.4;
  if (dash !== undefined) {
    const pattern = dash === 0 ? undefined : (Array.isArray(dash) ? dash : [dash]).join(' ');
    return (
      <svg width="18" height="8" aria-hidden="true" className="shrink-0">
        <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={pattern} opacity={opacity} />
      </svg>
    );
  }
  return (
    <span aria-hidden="true" className={cx(SWATCH_DOT, 'shrink-0')} style={{ backgroundColor: color, opacity }} />
  );
}

// Lays groups and items in a column by default, the side-rail form for the GPU telemetry stack. The
// horizontal form flows them as a wrapping row for a compact legend above a wide chart, such as the
// phase-timing breakdown.
export function GroupedLegend({
  groups,
  orientation = 'vertical',
}: {
  groups: LegendGroup[];
  orientation?: 'vertical' | 'horizontal';
}) {
  const row = orientation === 'horizontal';
  return (
    <div className={cx('flex gap-3', row ? 'flex-row flex-wrap items-center' : 'flex-col')}>
      {groups.map((group, gi) => (
        <div key={group.name ?? gi} className={cx('flex gap-1.5', row ? 'flex-row flex-wrap items-center' : 'flex-col')}>
          {group.name && <span className={cx(OVERLINE, 'font-medium')}>{group.name}</span>}
          {/* The items stretch to a uniform width so every pill box is the same size with left-aligned content. */}
          <div className={cx('flex gap-1', row ? 'flex-row flex-wrap items-center' : 'flex-col')}>
            {group.items.map(item => {
              const active = group.selected.has(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={e => group.onToggle(item.key, e.metaKey || e.ctrlKey)}
                  aria-pressed={active}
                  title="Click to isolate, click again to reset, Cmd or Ctrl click to multi-select"
                  className={cx(
                    'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                    FOCUS_RING,
                    active
                      ? 'border-border bg-elevated text-foreground'
                      : 'border-transparent text-faint hover:border-border hover:text-muted'
                  )}
                >
                  <Swatch color={item.color} dash={item.dash} active={active} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
