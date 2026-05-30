/*
 * The one table used across the dashboard so every table shares a surface, header, spacing, and row
 * treatment. A column declares its header and row renderer, and optionally a numeric/string sort value
 * that turns its header into a sort toggle. With no sortable column the table is static. The surface
 * matches ChartCard so a table drops straight into a ChartSection without a card.
 */

import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { useColumnSizing } from '@/hooks/useColumnSizing';
import { useVirtualRows } from '@/hooks/useVirtualRows';
import { FOCUS_RING, OVERLINE, SURFACE } from '@/utils/styles';

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
  // Tables sharing an id share widths, so scope the id (such as `proofs:${runId}`) to keep widths
  // separate per run. Omit it to keep the natural, non-resizable layout.
  tableId?: string;
}

export function DataTable<T>({ columns, rows, rowKey, initialSort, activeRowKey, className, tableId }: DataTableProps<T>) {
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
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {/* Spacers stand in for the rows above and below the rendered slice, holding the scroll height
              so the scrollbar and position match the full row count. */}
          {win.padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: win.padTop, padding: 0, border: 0 }} />
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
              <td colSpan={columns.length} style={{ height: win.padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// One row through memo so an unrelated state change re-renders only the rows whose own inputs changed.
// With the caller holding the row and column arrays stable, flipping the active highlight when a detail
// opens re-renders the two affected rows not the whole body, keeping opening a proof cheap on a table of
// thousands of rows.
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
      className={cx(
        // Explicit grey border on every row so the divide-y line a row gains when it leaves first position
        // does not animate from inherited currentColor (near-white) down to grey under transition-colors
        // on re-sort.
        'border-border text-foreground transition-colors hover:bg-elevated/40',
        active && 'bg-primary/10'
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
    </tr>
  );
}

// memo carries the generic call signature through the cast so the row keeps its typed props while
// skipping a re-render when its row, columns, active flag, and fixed flag are all unchanged.
const DataTableRow = memo(DataTableRowInner) as typeof DataTableRowInner;
