import * as React from 'react'
import { cn } from '../lib/cn'
import { Card } from './Card'
import { TableScroll } from './DataTable'

/**
 * A financial statement: labelled rows grouped into sections, each with an
 * optional subtotal, and grand totals in the footer.
 *
 * `DataTable` is a list of homogeneous records; a statement is not — it has
 * section headers, indented account lines, subtotal rules and a double-ruled
 * total. Five money pages (balance sheet, income statement, cash flow,
 * budget vs actual, trial balance) and the journal-entry lines all hand-rolled
 * that shape with different spacing, so it lives here once
 * (docs/specs/2026-10-15-design-system-v2.md §6 rule 9).
 *
 * Every value column is numeric: right-aligned with tabular figures. Values
 * arrive pre-formatted (the kit does not own currency formatting), so a
 * caller can colour a variance or print "—" for a zero.
 *
 * Accessible structure: one `<tbody>` per section with a `scope="rowgroup"`
 * header, row labels as `<th scope="row">`, totals in `<tfoot>`.
 * Server-component safe.
 */
export interface StatementColumn {
  key: string
  header: React.ReactNode
  /** Hide below `sm` (secondary columns on phones). */
  hideOnMobile?: boolean
}

export interface StatementRow {
  key: string
  label: React.ReactNode
  /** Second line under the label (account description, fund, memo). */
  detail?: React.ReactNode
  values: Record<string, React.ReactNode>
}

export interface StatementSection {
  key: string
  /** Section heading ("Assets"). Omit for a single unlabelled block. */
  title?: React.ReactNode
  rows: StatementRow[]
  /** Shown in place of rows when `rows` is empty. Default "None". */
  empty?: React.ReactNode
  subtotal?: { label: React.ReactNode; values: Record<string, React.ReactNode> }
}

export interface StatementTableProps {
  /** Accessible caption (visually hidden). */
  caption: string
  /** Header for the label column. Default "Account". */
  labelHeader?: React.ReactNode
  columns: StatementColumn[]
  sections: StatementSection[]
  /** Grand totals, rendered in `<tfoot>` under a double rule. */
  totals?: { key: string; label: React.ReactNode; values: Record<string, React.ReactNode> }[]
  /** Wrap in a Card (default). */
  framed?: boolean
  className?: string
}

const pad = 'px-4 py-2.5 sm:px-5'

export function StatementTable({
  caption,
  labelHeader = 'Account',
  columns,
  sections,
  totals,
  framed = true,
  className,
}: StatementTableProps) {
  const span = columns.length + 1
  const valueCells = (values: Record<string, React.ReactNode>, extra?: string) =>
    columns.map((c) => (
      <td
        key={c.key}
        className={cn('num whitespace-nowrap text-right align-top', pad, c.hideOnMobile && 'hidden sm:table-cell', extra)}
      >
        {values[c.key] ?? null}
      </td>
    ))

  const table = (
    <TableScroll>
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn('border-b border-border bg-subtle text-xs font-medium text-muted', 'px-4 py-2.5 sm:px-5')}>
              {labelHeader}
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap border-b border-border bg-subtle text-right text-xs font-medium text-muted',
                  'px-4 py-2.5 sm:px-5',
                  c.hideOnMobile && 'hidden sm:table-cell',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody key={section.key}>
            {section.title ? (
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={span}
                  className="px-4 pb-1.5 pt-5 text-left text-xs font-semibold uppercase tracking-wide text-muted sm:px-5"
                >
                  {section.title}
                </th>
              </tr>
            ) : null}
            {section.rows.length === 0 ? (
              <tr>
                <td colSpan={span} className={cn(pad, 'text-sm text-muted')}>
                  {section.empty ?? 'None'}
                </td>
              </tr>
            ) : (
              section.rows.map((row) => (
                <tr key={row.key} className="transition-colors duration-fast hover:bg-subtle/60">
                  <th scope="row" className={cn('align-top font-normal text-foreground', pad)}>
                    <span className="block">{row.label}</span>
                    {row.detail ? <span className="mt-0.5 block text-xs text-muted">{row.detail}</span> : null}
                  </th>
                  {valueCells(row.values, 'text-foreground')}
                </tr>
              ))
            )}
            {section.subtotal ? (
              <tr>
                <th scope="row" className={cn('border-t border-border text-left font-medium text-foreground', pad)}>
                  {section.subtotal.label}
                </th>
                {valueCells(section.subtotal.values, 'border-t border-border font-medium text-foreground')}
              </tr>
            ) : null}
          </tbody>
        ))}
        {totals && totals.length > 0 ? (
          <tfoot>
            {totals.map((t, i) => (
              <tr key={t.key} className="bg-subtle/60">
                <th
                  scope="row"
                  className={cn(
                    'text-left font-semibold text-foreground',
                    pad,
                    i === 0 && 'border-t-2 border-border-strong',
                  )}
                >
                  {t.label}
                </th>
                {valueCells(t.values, cn('font-semibold text-foreground', i === 0 && 'border-t-2 border-border-strong'))}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </TableScroll>
  )

  return framed ? <Card className={cn('overflow-hidden', className)}>{table}</Card> : <div className={className}>{table}</div>
}
