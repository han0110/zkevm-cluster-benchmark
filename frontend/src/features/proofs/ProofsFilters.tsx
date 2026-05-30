/*
 * Filter controls for the proofs table, a row of preset pills beside a Filters panel of the status
 * multi-select and range sliders. Presets and the panel write the same state so a preset lights up when
 * the state matches.
 */

import { useRef, useState, type ReactNode } from 'react';
import { RangeSlider } from '@/components/common/RangeSlider';
import { useDismissable } from '@/hooks/useDismissable';
import { cx } from '@/utils/cx';
import { ACTIVE_ACCENT, FOCUS_RING, OVERLINE, PILL, PILL_IDLE } from '@/utils/styles';
import {
  ALL_STATUSES,
  fullFilters,
  isFiltering,
  PROOF_PRESETS,
  statusLabel,
  type ProofBounds,
  type ProofFilters,
} from '@/features/proofs/proofFilters';
import type { BlockStatus } from '@/types/benchmark';

interface ProofsFiltersProps {
  filters: ProofFilters;
  onChange: (next: ProofFilters) => void;
  bounds: ProofBounds;
  shown: number;
  total: number;
}

export function ProofsFilters({ filters, onChange, bounds, shown, total }: ProofsFiltersProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close the panel on Escape or a click outside it.
  useDismissable(open, setOpen, { refs: [panelRef, buttonRef] });

  const presets = PROOF_PRESETS.filter(p => !p.enabled || p.enabled(bounds));
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
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(o => !o)}
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
          <div
            ref={panelRef}
            className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-elevated p-4 shadow-lg"
          >
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
          </div>
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
    <div className="flex flex-wrap gap-1.5">
      {ALL_STATUSES.map(status => {
        const active = value.includes(status);
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(active ? value.filter(s => s !== status) : [...value, status])}
            aria-pressed={active}
            className={cx(
              'rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
              FOCUS_RING,
              active ? ACTIVE_ACCENT : PILL_IDLE
            )}
          >
            {statusLabel(status)}
          </button>
        );
      })}
    </div>
  );
}

// A captioned control group inside the filter panel.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={OVERLINE}>{label}</span>
      {children}
    </div>
  );
}
