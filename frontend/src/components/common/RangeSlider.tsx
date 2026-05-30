/*
 * Dual-handle range slider from two overlaid native range inputs, so it stays keyboard accessible with
 * no dependency. The handles cannot cross, the selected span is filled in the brand color, and the
 * current bounds read below. Track and thumb styling lives in index.css under the range-slider class.
 */

import { cx } from '@/utils/cx';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  // Renders an endpoint value for the labels below the track.
  format: (n: number) => string;
  // Names the measure for the two handles' accessible names.
  ariaLabel: string;
  // An explicit step, for a discrete measure such as a node count. Defaults to a hundredth of the span.
  step?: number;
  className?: string;
}

export function RangeSlider({ min, max, value, onChange, format, ariaLabel, step: stepProp, className }: RangeSliderProps) {
  const span = max - min || 1;
  // The given step for a discrete measure, else a hundred steps across the span, never zero so the input
  // stays operable when the data is flat.
  const step = stepProp ?? (span / 100 || 1);
  // Clamp incoming values to the track. A preset that floors a handle beyond the data extent keeps its
  // unclamped value in the filter state while the slider renders inside its bounds.
  const clamp = (n: number): number => Math.max(min, Math.min(max, n));
  const lo = clamp(value[0]);
  const hi = clamp(value[1]);
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;
  // Raise the low handle above the high one at the top so it stays grabbable when both sit together at
  // the maximum.
  const lowOnTop = lo >= max - step / 2;

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-elevated" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={e => onChange([Math.min(Number(e.target.value), hi), hi])}
          aria-label={`minimum ${ariaLabel}`}
          className="range-slider"
          style={{ zIndex: lowOnTop ? 4 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={e => onChange([lo, Math.max(Number(e.target.value), lo)])}
          aria-label={`maximum ${ariaLabel}`}
          className="range-slider"
        />
      </div>
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{format(lo)}</span>
        <span>{format(hi)}</span>
      </div>
    </div>
  );
}
