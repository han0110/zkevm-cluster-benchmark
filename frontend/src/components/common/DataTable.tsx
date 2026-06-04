/*
 * The one table used across the dashboard so every table shares a surface, header, spacing, and row
 * treatment. A column declares its header and row renderer, and optionally a numeric/string sort value
 * that turns its header into a sort toggle. With no sortable column the table is static. The surface
 * matches ChartCard so a table drops straight into a ChartSection without a card.
 */

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { useColumnSizing } from '@/hooks/useColumnSizing';
import { useVirtualRows } from '@/hooks/useVirtualRows';
import { FOCUS_RING, OVERLINE, ROW_ACTIVE, ROW_BASE, ROW_IDLE, SURFACE } from '@/utils/styles';

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  // A column is sortable exactly when it exposes a sort value, null where the row has no value for it.
  sortValue?: (row: T) => number | string | null;
  align?: 'left' | 'right';
  // Explicit default width in px for a resizable table, used instead of the measured natural width. Set
  // it on a column whose content has no natural bound, such as a long id, so the table starts compact.
  width?: number;
}

type SortDir = 'asc' | 'desc';

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  // Column the table sorts by on first render, when that column is sortable.
  initialSort?: { key: string; dir: SortDir };
  // Key of the row to mark active, highlighted so a linked detail view shows its source row.
  activeRowKey?: string;
  className?: string;
  // When set, columns become drag-resizable and their widths persist in localStorage under this id.
  // Tables sharing an id share widths, so scope the id (such as `blocks:${runId}`) to keep widths
  // separate per run. Omit it to keep the natural, non-resizable layout.
  tableId?: string;
  // Called with the rows in their displayed order whenever the filter or active sort changes, so a
  // master-detail page can step its arrow-key navigation through what the reader actually sees rather
  // than the source order. Pass a stable callback so the notification fires only on a real reorder.
  onVisibleRowsChange?: (rows: T[]) => void;
}

export function DataTable<T>({ columns, rows, rowKey, initialSort, activeRowKey, className, tableId, onVisibleRowsChange }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort ?? null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sizing = useColumnSizing(columns, tableRef, tableId);
  // Columns pin to explicit widths only once known. Until then the table keeps its natural layout so the
  // first measure reads true content widths.
  const fixed = sizing.enabled && sizing.widths != null;

  const sorted = useMemo(() => {
    const sortValue = sort ? columns.find(c => c.key === sort.key)?.sortValue : undefined;
    if (!sort || !sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Sort a copy so source order is preserved for other consumers. Rows without a value for the active
    // column sink to the bottom regardless of direction.
    return [...rows].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, columns, sort]);

  // Report the displayed order to a master-detail owner so its arrow keys step the visible set. Fires
  // only when the sorted-and-filtered rows actually change, since `sorted` is memoized.
  useEffect(() => {
    onVisibleRowsChange?.(sorted);
  }, [sorted, onVisibleRowsChange]);

  const toggleSort = (column: DataColumn<T>): void => {
    if (!column.sortValue) return;
    setSort(prev =>
      prev && prev.key === column.key
        ? { key: column.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, dir: 'asc' }
    );
  };

  // A long table renders only the rows near the viewport, a short one renders in full so the small
  // per-node and hardware tables keep their exact layout. The scroll container is this wrapper.
  const win = useVirtualRows(scrollRef, sorted.length);
  const visible = win.enabled ? sorted.slice(win.start, win.end) : sorted;

  // Index of the active row within the displayed order, recomputed whenever the sort or the rows move it.
  // A re-sort or a new rows prop that relocates the open row changes this index even when the active key
  // is unchanged, so it drives the keep-in-view effect alongside the key itself.
  const activeIndex = useMemo(
    () => (activeRowKey == null ? -1 : sorted.findIndex(row => rowKey(row) === activeRowKey)),
    [sorted, activeRowKey, rowKey]
  );

  // Keep the active row in view when it changes or a reorder relocates it, so stepping the open row with
  // the arrow keys or re-sorting the table never leaves the cursor on a row scrolled out of sight. The
  // effect tracks both the active key and its index in the displayed order, so a plain selection change
  // and a reorder that moves the same row both re-scroll, while an unchanged key at an unchanged index
  // is a no-op so it never fights the reader's own scrolling. scrollIntoView with block:'nearest' and
  // win.scrollToIndex already do nothing when the row is visible.
  const prevScrollRef = useRef<{ key: string; index: number } | null>(null);
  useEffect(() => {
    if (activeRowKey == null || activeIndex < 0) {
      prevScrollRef.current = null;
      return;
    }
    const prev = prevScrollRef.current;
    if (prev && prev.key === activeRowKey && prev.index === activeIndex) return;
    prevScrollRef.current = { key: activeRowKey, index: activeIndex };
    if (win.enabled) {
      win.scrollToIndex(activeIndex);
    } else {
      scrollRef.current?.querySelector('[data-active-row]')?.scrollIntoView({ block: 'nearest' });
    }
    // The active key and its displayed index are the triggers. The rest are read fresh from the render
    // they changed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRowKey, activeIndex]);

  return (
    <div ref={scrollRef} className={cx('overflow-x-auto', SURFACE, className)}>
      <table
        ref={tableRef}
        // Natural width while not resizable, a content-sized shrink-to-fit during the first measure, then
        // the summed width with a full-width floor once pinned, so a widened column grows the table and
        // reveals through the wrapper's horizontal scroll.
        className={cx('text-sm', fixed ? 'table-fixed' : sizing.enabled ? 'w-max' : 'w-full')}
        style={fixed ? { width: sizing.totalWidth, minWidth: '100%' } : undefined}
      >
        {fixed && sizing.widths && (
          <colgroup>
            {columns.map(column => (
              <col key={column.key} style={{ width: sizing.widths![column.key] }} />
            ))}
            {/* Auto-width spacer column. When the summed column widths fall short of the container, fixed
                table layout would otherwise restretch every column to fill the full-width floor, so a drag
                appeared to resize them all. This column absorbs that slack instead, so a drag changes only
                the dragged column and, at most, this spacer. It collapses to zero once the table overflows
                and the wrapper scrolls. */}
            <col aria-hidden="true" />
          </colgroup>
        )}
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className={cx('border-b border-border text-left', OVERLINE)}>
            {columns.map(column => {
              const dir = sort?.key === column.key ? sort.dir : null;
              return (
                <th
                  key={column.key}
                  data-col-key={sizing.enabled ? column.key : undefined}
                  aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx(
                    'whitespace-nowrap px-4 py-2.5 font-semibold',
                    sizing.enabled && 'relative',
                    column.align === 'right' && 'text-right'
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cx(
                        'inline-flex max-w-full items-center gap-1 truncate rounded-sm hover:text-foreground',
                        FOCUS_RING,
                        column.align === 'right' && 'flex-row-reverse',
                        dir && 'text-foreground'
                      )}
                    >
                      {column.header}
                      {/* Indicator is always present and only its glyph toggles, so the header keeps its
                          width when sorted rather than shifting the layout. */}
                      <span aria-hidden="true" className={cx('text-[0.7em]', !dir && 'invisible')}>
                        {dir === 'desc' ? <>&#9660;</> : <>&#9650;</>}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                  {sizing.enabled && (
                    // Grabber over the column's right edge. Drag resizes, double click resets to default,
                    // arrow keys nudge for keyboard reach. Sits in the header's right padding so it never
                    // overlaps the label.
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${typeof column.header === 'string' ? column.header : column.key} column`}
                      tabIndex={0}
                      onPointerDown={e => sizing.startResize(column.key, e)}
                      onKeyDown={e => sizing.onHandleKeyDown(column.key, e)}
                      onDoubleClick={() => sizing.resetColumn(column.key)}
                      className={cx(
                        'group/resize absolute right-0 top-0 flex h-full w-2.5 touch-none select-none items-center justify-center',
                        'cursor-col-resize',
                        FOCUS_RING
                      )}
                    >
                      <span aria-hidden="true" className="h-1/2 w-px bg-border transition-colors group-hover/resize:bg-primary" />
                    </span>
                  )}
                </th>
              );
            })}
            {/* Header cell for the slack-absorbing spacer column, never resizable. */}
            {fixed && <th aria-hidden="true" className="p-0" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {/* Spacers stand in for the rows above and below the rendered slice, holding the scroll height
              so the scrollbar and position match the full row count. */}
          {win.padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={fixed ? columns.length + 1 : columns.length} style={{ height: win.padTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {visible.map(row => {
            const key = rowKey(row);
            return (
              <DataTableRow
                key={key}
                row={row}
                columns={columns}
                active={activeRowKey != null && key === activeRowKey}
                fixed={fixed}
              />
            );
          })}
          {win.padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={fixed ? columns.length + 1 : columns.length} style={{ height: win.padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Memoized so flipping the active highlight re-renders only the affected rows, not the whole body, on a
// table of thousands of rows.
function DataTableRowInner<T>({
  row,
  columns,
  active,
  fixed,
}: {
  row: T;
  columns: DataColumn<T>[];
  active: boolean;
  fixed: boolean;
}) {
  return (
    <tr
      data-row=""
      data-active-row={active ? '' : undefined}
      className={cx(
        // ROW_BASE carries the explicit grey border on every row so the divide-y line a row gains when it
        // leaves first position does not animate from inherited currentColor (near-white) down to grey
        // under transition-colors on re-sort. ROW_ACTIVE keeps the selected row's highlight under the
        // cursor, deepening rather than switching to the grey ROW_IDLE hover tint, so the open row never
        // reads as deselected while hovered.
        ROW_BASE,
        active ? ROW_ACTIVE : ROW_IDLE
      )}
    >
      {columns.map(column => (
        <td
          key={column.key}
          className={cx(
            'whitespace-nowrap px-4 py-2.5',
            // Fixed columns clip overflow so a narrowed column never spills into its neighbor. The
            // natural layout keeps its content-driven width and needs no clip.
            fixed && 'overflow-hidden',
            column.align === 'right' && 'text-right'
          )}
        >
          {column.render(row)}
        </td>
      ))}
      {/* Filler cell under the slack-absorbing spacer column, so its width is the table's free space. */}
      {fixed && <td aria-hidden="true" className="p-0" />}
    </tr>
  );
}

// Cast preserves the generic call signature through memo so the row keeps its typed props.
const DataTableRow = memo(DataTableRowInner) as typeof DataTableRowInner;
