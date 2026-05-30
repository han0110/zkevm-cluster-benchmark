/*
 * Presentational primitive for the small empty-and-warning messages when a section has nothing to
 * render. Tone selects the text token, faint for an unremarkable absence and warning for an incomplete
 * or failed result. className carries any layout the caller needs, and the tag is configurable so a
 * caller keeps its markup, a paragraph for a faint note and a centered division for a warning panel.
 */

import { type ElementType, type ReactNode } from 'react';
import { cx } from '@/utils/cx';

type Tone = 'faint' | 'warning';

const TONE_CLASS: Record<Tone, string> = {
  faint: 'text-faint',
  warning: 'text-warning',
};

interface EmptyStateProps {
  tone: Tone;
  children: ReactNode;
  // The rendered tag, a paragraph by default so a faint note keeps its original element.
  as?: ElementType;
  // Layout classes composed ahead of the base size and tone, so the joined string matches the caller's.
  className?: string;
}

export function EmptyState({ tone, children, as: Tag = 'p', className }: EmptyStateProps) {
  return <Tag className={cx(className, 'text-sm', TONE_CLASS[tone])}>{children}</Tag>;
}
