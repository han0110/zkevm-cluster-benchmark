/* Shared Tailwind class fragments composed through cx, so one visual treatment is defined in one place. */

// Brand focus ring shared by every interactive control, so keyboard focus reads the same everywhere.
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

// Icon-only control chrome, a rounded target lifting to a faint background on hover. Pair with a color
// (ICON_BUTTON_COLOR or a stateful override), a size, and FOCUS_RING so every icon button reads with the
// same hover and focus effect across the app.
export const ICON_BUTTON = 'shrink-0 rounded-md transition-colors hover:bg-elevated/60';

// The default icon-button color, muted lifting to full foreground on hover. A stateful control such as
// the copy button keeps ICON_BUTTON's structure but swaps this for its own color.
export const ICON_BUTTON_COLOR = 'text-muted hover:text-foreground';

// Icon-button sizes, the padding and glyph growing together so the target keeps the same proportion at
// either size.
export const ICON_BUTTON_SM = 'p-0.5 [&_svg]:size-3.5';
export const ICON_BUTTON_MD = 'p-1 [&_svg]:size-4';

// Faint uppercase caption for stat labels, table headers, and legend group names.
export const OVERLINE = 'text-xs uppercase tracking-wider text-faint';

// The round color swatch chart legends share, sized once so every dot matches.
export const SWATCH_DOT = 'inline-block h-2.5 w-2.5 rounded-full';

// The elevated panel surface shared by chart cards and tables, so every panel reads the same.
export const SURFACE = 'rounded-xl border border-border bg-surface shadow-sm';

// The hover/focus reveal popover shared by Truncated and HelpTip, without the per-use position,
// width, and text treatment, so the popover surface reads identically wherever a control reveals one.
export const REVEAL_BOX =
  'pointer-events-none absolute top-full z-30 mt-1 hidden whitespace-normal rounded-md border border-border bg-elevated p-2 font-normal normal-case leading-snug tracking-normal shadow-lg';

// Pill button base shared by the block filter presets and the re-run button.
export const PILL = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors';

// The selected accent border and tint shared by active pills and the active nav tab.
export const ACTIVE_ACCENT = 'border-primary bg-primary/15 text-foreground';

// The idle pill state, a muted border that warms on hover.
export const PILL_IDLE = 'border-border text-muted hover:border-primary/60 hover:text-foreground';

// Data table row treatment, the shared base plus the active and idle states, so a selected row keeps its
// highlight under the cursor while an unselected row warms to the faint hover tint.
export const ROW_BASE = 'border-border text-foreground transition-colors';
export const ROW_ACTIVE = 'bg-primary/10 hover:bg-primary/20';
export const ROW_IDLE = 'hover:bg-elevated/40';
