import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { Card } from './Card'

/**
 * A styled table inside a horizontal scroll container.
 *
 * The audit counted 48 hand-styled `<table>`s and 22 `overflow-x-auto`
 * wrappers: the rest push the page sideways on a phone (finding 9). Using
 * this makes the scroll container impossible to forget.
 *
 * Server-first: it renders on the server and holds no state. Sorting is a
 * URL concern — pass the current `sort` and a `sortHref` builder and the
 * headers become links (with `aria-sort`); the query does the sorting.
 *
 * v2 additions: sticky header (inside `maxHeight`), row hover, `density`,
 * `mobile="cards"` (each row becomes a labelled card under `md`), `empty`
 * and `footer` slots.
 */
export interface DataTableColumn<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  /** Right-aligned, tabular figures. Use for money and counts. */
  numeric?: boolean
  /** Extra classes for this column's `<th>` and `<td>`. */
  className?: string
  /** Header becomes a sort link (needs `sortHref` on the table). */
  sortable?: boolean
  /** In `mobile="cards"`: drop this column from the card. */
  hideOnMobile?: boolean
  /** In `mobile="cards"`: use this column as the card title (default: first column). */
  mobilePrimary?: boolean
  /** In `mobile="cards"`: show this value large, beside the card title (an amount owed). */
  mobileAside?: boolean
  /** Hide below `lg` in the table layout (secondary columns on tablets). */
  hideBelowLg?: boolean
}

export type SortDirection = 'asc' | 'desc'

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Accessible caption. Visually hidden unless `showCaption`. */
  caption?: React.ReactNode
  showCaption?: boolean
  /** Keep the first column visible while scrolling sideways on a phone. */
  stickyFirstColumn?: boolean
  /**
   * Wrap in a Card (default). Pass false when the table already sits inside
   * a Card that has its own header.
   */
  framed?: boolean
  className?: string
  /** `compact` for dense ledgers (36px rows); `comfortable` default (44px). */
  density?: 'comfortable' | 'compact'
  /** Current sort, for the header affordance and `aria-sort`. */
  sort?: { key: string; direction: SortDirection }
  /** Builds the URL for sorting by `key` in `direction`. Enables sortable headers. */
  sortHref?: (key: string, direction: SortDirection) => string
  /** Router link component for sort links (e.g. next/link). */
  linkAs?: React.ElementType
  /** `cards` turns each row into a labelled card below `md`. Default `scroll`. */
  mobile?: 'scroll' | 'cards'
  /** Cap the height (e.g. "28rem") so the header sticks while the body scrolls. */
  maxHeight?: string
  /** Rendered in place of the body when `rows` is empty (an EmptyState compact). */
  empty?: React.ReactNode
  /** Under the table, inside the frame: a Pager or a totals line. */
  footer?: React.ReactNode
  /** Extra classes per row (e.g. highlight overdue). */
  rowClassName?: (row: T) => string | undefined
}

/** Just the scroll container, for tables too irregular for `DataTable`. */
export function TableScroll({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    // On paper there is no sideways scroll: a scroller would clip the
    // right-hand columns, so print lets the table lay out at full width.
    // Focusable (tabIndex 0) so a keyboard-only user can scroll a wide table
    // sideways with the arrow keys (WCAG 2.1.1; axe scrollable-region-focusable).
    <div
      tabIndex={0}
      className={cn(
        'w-full overflow-x-auto print:overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function SortHeader({
  col,
  sort,
  sortHref,
  linkAs: LinkAs,
}: {
  col: { key: string; header: React.ReactNode; numeric?: boolean }
  sort?: { key: string; direction: SortDirection }
  sortHref: (key: string, direction: SortDirection) => string
  linkAs: React.ElementType
}) {
  const active = sort?.key === col.key
  const next: SortDirection = active && sort?.direction === 'asc' ? 'desc' : 'asc'
  const Icon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <LinkAs
      href={sortHref(col.key, next)}
      className={cn(
        'group -mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 no-underline transition-colors hover:bg-subtle hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'text-foreground',
        col.numeric && 'flex-row-reverse',
      )}
    >
      <span>{col.header}</span>
      <Icon
        className={cn('size-3.5 shrink-0', active ? 'opacity-100' : 'opacity-40 group-hover:opacity-80')}
        aria-hidden
      />
    </LinkAs>
  )
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  showCaption = false,
  stickyFirstColumn = false,
  framed = true,
  className,
  density = 'comfortable',
  sort,
  sortHref,
  linkAs = 'a',
  mobile = 'scroll',
  maxHeight,
  empty,
  footer,
  rowClassName,
}: DataTableProps<T>) {
  const sticky = (index: number, head = false) =>
    stickyFirstColumn && index === 0
      ? cn('sticky left-0 z-[1]', head ? 'z-[3] bg-subtle' : 'bg-surface group-hover/row:bg-subtle')
      : ''
  const cellPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3'
  const isEmpty = rows.length === 0 && empty !== undefined

  const table = (
    <TableScroll
      className={cn(mobile === 'cards' && 'hidden md:block', maxHeight && 'overflow-y-auto')}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        {caption ? (
          <caption className={showCaption ? 'px-4 py-2 text-left text-xs text-muted' : 'sr-only'}>
            {caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((col, i) => {
              const ariaSort =
                sort?.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable && sortHref ? (ariaSort ?? 'none') : ariaSort}
                  className={cn(
                    'sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-subtle text-xs font-medium text-muted',
                    density === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5',
                    col.numeric && 'text-right',
                    col.hideBelowLg && 'hidden lg:table-cell',
                    sticky(i, true),
                    col.className,
                  )}
                >
                  {col.sortable && sortHref ? (
                    <SortHeader col={col} sort={sort} sortHref={sortHref} linkAs={linkAs} />
                  ) : (
                    col.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'group/row transition-colors duration-fast hover:bg-subtle/70 [&:last-child>td]:border-b-0',
                  rowClassName?.(row),
                )}
              >
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      'border-b border-border align-middle text-foreground',
                      cellPad,
                      col.numeric && 'num text-right',
                      col.hideBelowLg && 'hidden lg:table-cell',
                      sticky(i),
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
  )

  const primaryIndex = Math.max(
    0,
    columns.findIndex((c) => c.mobilePrimary),
  )
  const asideIndex = columns.findIndex((c, i) => c.mobileAside && i !== primaryIndex && !c.hideOnMobile)
  const cards =
    mobile === 'cards' ? (
      <ul className="divide-y divide-border md:hidden" aria-label={typeof caption === 'string' ? caption : undefined}>
        {isEmpty ? (
          <li>{empty}</li>
        ) : (
          rows.map((row) => (
            <li key={rowKey(row)} className={cn('space-y-2 px-4 py-3.5', rowClassName?.(row))}>
              {asideIndex >= 0 ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm font-medium text-foreground">{columns[primaryIndex]?.cell(row)}</div>
                  <div className="num shrink-0 text-right text-base font-semibold text-foreground">
                    <span className="sr-only">{columns[asideIndex].header}: </span>
                    {columns[asideIndex].cell(row)}
                  </div>
                </div>
              ) : (
                <div className="text-sm font-medium text-foreground">{columns[primaryIndex]?.cell(row)}</div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {columns.map((col, i) =>
                  i === primaryIndex || i === asideIndex || col.hideOnMobile ? null : (
                    <React.Fragment key={col.key}>
                      <dt className="text-xs text-muted">{col.header}</dt>
                      <dd className={cn('min-w-0 text-right text-foreground', col.numeric && 'num')}>{col.cell(row)}</dd>
                    </React.Fragment>
                  ),
                )}
              </dl>
            </li>
          ))
        )}
      </ul>
    ) : null

  const body = (
    <>
      {table}
      {cards}
      {footer ? <div className="border-t border-border">{footer}</div> : null}
    </>
  )

  return framed ? (
    <Card className={cn('overflow-hidden', className)}>{body}</Card>
  ) : (
    <div className={className}>{body}</div>
  )
}
