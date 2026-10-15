import * as React from 'react'
import { cn } from '../lib/cn'
import { Card } from './Card'

/**
 * A styled table inside a horizontal scroll container.
 *
 * The audit counted 48 hand-styled `<table>`s and 22 `overflow-x-auto`
 * wrappers: the rest push the page sideways on a phone (finding 9). Using
 * this makes the scroll container impossible to forget.
 *
 * Deliberately not a data grid — no client-side sorting or filtering. It
 * renders on the server, so sorting belongs in the query.
 */
export interface DataTableColumn<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  /** Right-aligned, tabular figures. Use for money and counts. */
  numeric?: boolean
  /** Extra classes for this column's `<th>` and `<td>`. */
  className?: string
}

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
}

/** Just the scroll container, for tables too irregular for `DataTable`. */
export function TableScroll({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)} {...props}>
      {children}
    </div>
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
}: DataTableProps<T>) {
  const sticky = (index: number) =>
    stickyFirstColumn && index === 0 ? 'sticky left-0 z-[1] bg-surface' : ''

  const table = (
    <TableScroll>
      <table className="w-full text-left text-sm">
        {caption ? (
          <caption className={showCaption ? 'px-4 py-2 text-left text-xs text-muted' : 'sr-only'}>
            {caption}
          </caption>
        ) : null}
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2 font-medium',
                  col.numeric && 'text-right',
                  sticky(i),
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0">
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-2 align-top',
                    col.numeric && 'text-right font-mono tabular-nums',
                    sticky(i),
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  )

  return framed ? <Card className={className}>{table}</Card> : <div className={className}>{table}</div>
}
