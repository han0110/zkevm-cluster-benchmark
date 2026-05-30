/*
 * Reads semantic theme tokens from CSS variables as hex for chart libraries. The app ships one dark
 * theme so colors are computed once. The hook shape leaves room for theme switching later.
 */

import { resolveCssColorToHex } from '@/utils/color';

export interface ThemeColors {
  background: string;
  surface: string;
  elevated: string;
  foreground: string;
  muted: string;
  faint: string;
  border: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

const readToken = (name: string): string => resolveCssColorToHex(`var(${name})`);

// Single static theme, so colors are resolved once and shared. Resolution is deferred to the first read
// not module load, because the Tailwind theme stylesheet defining the custom properties is injected
// after the chart modules evaluate, so an eager read captures empty values. A theme toggle would reset
// this cache.
let cached: ThemeColors | null = null;

export function useThemeColors(): ThemeColors {
  if (cached) return cached;
  cached = {
    background: readToken('--color-background'),
    surface: readToken('--color-surface'),
    elevated: readToken('--color-elevated'),
    foreground: readToken('--color-foreground'),
    muted: readToken('--color-muted'),
    faint: readToken('--color-faint'),
    border: readToken('--color-border'),
    primary: readToken('--color-primary'),
    accent: readToken('--color-accent'),
    success: readToken('--color-success'),
    warning: readToken('--color-warning'),
    danger: readToken('--color-danger'),
  };
  return cached;
}
