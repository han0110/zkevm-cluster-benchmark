/*
 * Flat single-stroke line icons on one 24-unit grid so the rail, breadcrumb, and proof panel share one
 * visual language. Each inherits size and color from the caller through className and currentColor, and
 * is aria-hidden because every icon sits beside a text label or an aria-label on its control.
 */

import type { SVGProps } from 'react';
import { cx } from '@/utils/cx';

// Shared frame for every icon, fixing the grid, the flat stroke weight, and the rounded joints once.
function Icon({ className, children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx('h-5 w-5 shrink-0', className)}
      {...rest}
    >
      {children}
    </svg>
  );
}

// A house, the root of the breadcrumb trail.
export function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9.5h14V10" />
    </Icon>
  );
}

// A small bar chart, the Overview view.
export function IconOverview(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20h16" />
      <path d="M7 20v-7" />
      <path d="M12 20V5" />
      <path d="M17 20v-10" />
    </Icon>
  );
}

// A bulleted list, the Proofs table.
export function IconProofs(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4.5 6h.01" />
      <path d="M4.5 12h.01" />
      <path d="M4.5 18h.01" />
    </Icon>
  );
}

// Two stacked server units, the Metrics view.
export function IconNodes(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="6" rx="1.5" />
      <rect x="4" y="13" width="16" height="6" rx="1.5" />
      <path d="M7.5 8h.01" />
      <path d="M7.5 16h.01" />
    </Icon>
  );
}

// A leftward chevron, the collapse affordance.
export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14 6l-6 6 6 6" />
    </Icon>
  );
}

// A rightward chevron, the expand and the panel-close affordance.
export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 6l6 6-6 6" />
    </Icon>
  );
}

// A small downward chevron, the dropdown's open affordance. It sits on its own 16-unit grid with a
// lighter stroke, so it is drawn outside the shared Icon frame and the caller supplies the className
// that tints and flips it when the menu opens.
export function IconChevronDown({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className} {...rest}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
