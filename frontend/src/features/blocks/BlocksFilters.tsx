/*
 * Filter controls for the blocks table, a row of preset pills beside a Filters panel of the status
 * multi-select and range sliders. Presets and the panel write the same state so a preset lights up when
 * the state matches.
 */

import { Field } from '@/components/common/Field';
import { RangeSlider } from '@/components/common/RangeSlider';
import { usePopover } from '@/hooks/usePopover';
import { PopoverPanel } from '@/components/common/Popover';
import { ChipRow } from '@/components/common/ChipToggle';
import { cx } from '@/utils/cx';
import { ACTIVE_ACCENT, FOCUS_RING, PILL, PILL_IDLE } from '@/utils/styles';
import {
  ALL_STATUSES,
  fullFilters,
  isFiltering,
  BLOCK_PRESETS,
  type BlockBounds,
  type BlockFilters,
} from '@/features/blocks/blockFilters';
import type { BlockStatus } from '@/types/benchmark';

interface BlocksFiltersProps {
  filters: BlockFilters;
  onChange: (next: BlockFilters) => void;
  bounds: BlockBounds;
  shown: number;
  total: number;
}

export function BlocksFilters({ filters, onChange, bounds, shown, total }: BlocksFiltersProps) {
  const { open, toggle, triggerRef, panelRef } = usePopover();

  const presets = BLOCK_PRESETS.filter(p => !p.enabled || p.enabled(bounds));
  const filtering = isFiltering(filters, bounds);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(preset => {
        const active = preset.isActive(filters, bounds);
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.toggle(filters, bounds))}
            aria-pressed={active}
            className={cx(PILL, FOCUS_RING, active ? ACTIVE_ACCENT : PILL_IDLE)}
          >
            {preset.label}
          </button>
        );
      })}

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cx(
            PILL,
            FOCUS_RING,
            filtering ? 'border-primary text-foreground' : PILL_IDLE
          )}
        >
          Filters
        </button>

        {open && (
          <PopoverPanel panelRef={panelRef} className="w-72">
            <div className="flex flex-col gap-4">
              <Field label="Status">
                <StatusChips
                  value={filters.statuses}
                  onChange={statuses => onChange({ ...filters, statuses })}
                />
              </Field>

              <Field label="Proving time (s)">
                <RangeSlider
                  min={bounds.time[0]}
                  max={bounds.time[1]}
                  value={filters.time}
                  onChange={time => onChange({ ...filters, time })}
                  format={v => v.toFixed(2)}
                  ariaLabel="proving time"
                />
              </Field>

              {bounds.gas && (
                <Field label="Gas used (M)">
                  <RangeSlider
                    min={bounds.gas[0]}
                    max={bounds.gas[1]}
                    value={filters.gas}
                    onChange={gas => onChange({ ...filters, gas })}
                    format={v => v.toFixed(1)}
                    ariaLabel="gas used"
                  />
                </Field>
              )}

              {bounds.nodes && (
                <Field label="Nodes">
                  <RangeSlider
                    min={bounds.nodes[0]}
                    max={bounds.nodes[1]}
                    value={filters.nodes}
                    onChange={nodes => onChange({ ...filters, nodes })}
                    format={v => String(Math.round(v))}
                    step={1}
                    ariaLabel="node count"
                  />
                </Field>
              )}
            </div>
          </PopoverPanel>
        )}
      </div>

      <span className="text-xs text-muted tabular-nums">
        {shown} of {total}
      </span>
      {filtering && (
        <button
          type="button"
          onClick={() => onChange(fullFilters(bounds))}
          className={cx('rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-foreground', FOCUS_RING)}
        >
          Clear
        </button>
      )}
    </div>
  );
}

// Status multi-select, one toggle chip per outcome. An empty set shows every status, so toggling all
// chips off is the same as showing all, and any combination stacks.
function StatusChips({ value, onChange }: { value: BlockStatus[]; onChange: (next: BlockStatus[]) => void }) {
  return (
    <ChipRow
      items={ALL_STATUSES}
      isSelected={status => value.includes(status)}
      onToggle={status =>
        onChange(value.includes(status) ? value.filter(s => s !== status) : [...value, status])
      }
      getKey={status => status}
      getLabel={status => <span className="capitalize">{status}</span>}
    />
  );
}
