/*
 * Per-column width state for the resizable DataTable. A dragged width is persisted per table in
 * localStorage and layered over a default that is either declared on the column or measured from its
 * natural content width on first mount. The measure runs in a layout effect before paint so the table
 * switches from auto to fixed layout without a visible reflow. Only dragged columns are stored so a new
 * column picks up a measured default and a reset returns a column to that default.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

// Smallest width a column can be dragged or nudged to, so a column never collapses out of reach.
const MIN_COLUMN_PX = 56;
// Width one arrow-key press adds or removes, so a column is resizable without a pointer.
const KEYBOARD_STEP_PX = 24;

type Widths = Record<string, number>;

// What the table reads from each column to size it, its key and an optional explicit default width.
export interface SizingColumn {
  key: string;
  width?: number;
}

export interface ColumnSizing {
  enabled: boolean;
  // Effective width per column once known, or null while natural widths are being measured or sizing is
  // disabled. While null the table renders in its natural layout.
  widths: Widths | null;
  // Sum of the effective widths, the table's laid-out width when its columns are fixed.
  totalWidth: number;
  startResize: (key: string, e: ReactPointerEvent) => void;
  onHandleKeyDown: (key: string, e: ReactKeyboardEvent) => void;
  resetColumn: (key: string) => void;
}

// The table ref is owned by the caller and passed in, so the returned struct carries no ref value and the
// caller reads the sizing fields during render without tripping the no-ref-in-render rule. The ref is
// read only inside the layout effect and pointer handlers, never during render.
export function useColumnSizing(
  columns: SizingColumn[],
  tableRef: RefObject<HTMLTableElement | null>,
  tableId?: string
): ColumnSizing {
  const enabled = tableId != null;
  const storageKey = enabled ? `table-widths:${tableId}` : null;
  const sig = columns.map(c => c.key).join('|');

  // Only dragged widths are stored, keyed by column. Defaults are never persisted so a later default
  // change or a new column is picked up rather than frozen by a stale stored value.
  const [overrides, setOverrides] = useState<Widths>(() => {
    if (!storageKey) return {};
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Widths) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(overrides));
    } catch {
      // Storage unavailable, the widths still apply for the session.
    }
  }, [storageKey, overrides]);

  // Measured natural widths, tagged with the column signature they were measured for, so a column-set
  // change triggers a fresh measure rather than reusing widths from a different layout.
  const [natural, setNatural] = useState<{ sig: string; widths: Widths } | null>(null);

  useLayoutEffect(() => {
    if (!enabled || (natural && natural.sig === sig)) return;
    const cells = tableRef.current?.querySelectorAll<HTMLElement>('thead th[data-col-key]');
    if (!cells || !cells.length) return;
    const measured: Widths = {};
    cells.forEach(cell => {
      const key = cell.dataset.colKey;
      if (key) measured[key] = Math.round(cell.getBoundingClientRect().width);
    });
    setNatural({ sig, widths: measured });
  }, [enabled, sig, natural, tableRef]);

  const widths = useMemo<Widths | null>(() => {
    if (!enabled || !natural || natural.sig !== sig) return null;
    return Object.fromEntries(
      columns.map(col => [col.key, overrides[col.key] ?? col.width ?? natural.widths[col.key] ?? MIN_COLUMN_PX])
    );
  }, [enabled, natural, overrides, columns, sig]);

  const totalWidth = useMemo(() => (widths ? Object.values(widths).reduce((a, b) => a + b, 0) : 0), [widths]);

  // Teardown for an in-flight drag, run on unmount so a drag interrupted by a route or run change cannot
  // leak window listeners or leave the page unselectable.
  const dragTeardown = useRef<(() => void) | null>(null);
  useEffect(() => () => dragTeardown.current?.(), []);

  // The header's current laid-out width, the base a drag or key nudge adjusts from, so resizing tracks
  // what the reader sees even when the fixed table stretched the columns to fill spare width.
  const headerWidth = useCallback(
    (key: string): number => {
      const cell = tableRef.current?.querySelector<HTMLElement>(`thead th[data-col-key="${CSS.escape(key)}"]`);
      return cell ? cell.getBoundingClientRect().width : MIN_COLUMN_PX;
    },
    [tableRef]
  );

  const startResize = useCallback(
    (key: string, e: ReactPointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = headerWidth(key);
      const move = (ev: PointerEvent): void => {
        const next = Math.max(MIN_COLUMN_PX, Math.round(startW + (ev.clientX - startX)));
        setOverrides(prev => ({ ...prev, [key]: next }));
      };
      const stop = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        document.body.style.userSelect = '';
        dragTeardown.current = null;
      };
      dragTeardown.current = stop;
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [headerWidth]
  );

  // Left and right arrows nudge the focused handle, so a column is resizable from the keyboard.
  const onHandleKeyDown = useCallback(
    (key: string, e: ReactKeyboardEvent): void => {
      const delta = e.key === 'ArrowLeft' ? -KEYBOARD_STEP_PX : e.key === 'ArrowRight' ? KEYBOARD_STEP_PX : 0;
      if (delta === 0) return;
      e.preventDefault();
      const base = headerWidth(key);
      setOverrides(prev => ({ ...prev, [key]: Math.max(MIN_COLUMN_PX, Math.round((prev[key] ?? base) + delta)) }));
    },
    [headerWidth]
  );

  // Drop a column's stored width so it returns to its declared or measured default.
  const resetColumn = useCallback((key: string): void => {
    setOverrides(prev => (key in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)) : prev));
  }, []);

  return { enabled, widths, totalWidth, startResize, onHandleKeyDown, resetColumn };
}
