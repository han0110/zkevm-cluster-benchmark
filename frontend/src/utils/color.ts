/*
 * Color utilities. Tailwind v4 emits theme colors as oklch() which ECharts cannot parse, so these
 * resolve any CSS color (var() refs and oklch included) to hex by computing it on a throwaway element
 * then normalizing through culori.
 */

import { formatHex } from 'culori';

// Resolve any CSS color string (oklch, var(--x), rgb, named) to a 6-digit hex value.
export function resolveCssColorToHex(color: string, fallback = '#000000'): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;

  const probe = document.createElement('div');
  probe.style.color = color;
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  document.body.removeChild(probe);

  return formatHex(computed) ?? fallback;
}

// Relative luminance of a 6-digit hex color using the sRGB coefficients.
function luminance(hex: string): number {
  const v = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * v(r) + 0.7152 * v(g) + 0.0722 * v(b);
}

// Readable text color (warm-dark ink or near-white) for a label sitting on a colored fill, chosen by
// the fill's luminance so bar labels stay legible across the whole palette including the light wheat tan.
export const contrastText = (hex: string, dark = '#1a1410', light = '#f2e8da'): string =>
  /^#[0-9A-Fa-f]{6}$/.test(hex) && luminance(hex) > 0.45 ? dark : light;
