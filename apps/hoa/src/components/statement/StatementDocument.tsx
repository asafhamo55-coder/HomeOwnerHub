import { ReceiptText } from 'lucide-react'
import { DataTable, EmptyState, type DataTableColumn } from '@homeowner-portal/ui'
import type { LedgerEntry, StatementWindow } from '@/lib/resident-ledger'
import { formatDay } from '@/lib/money/format'

// The printed account statement, shared by the resident's own page and the
// board's per-owner page, so both render the same builder output the same way.
// Pure presentation: every figure comes from a StatementWindow.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function balanceText(n: number): string {
  return n < 0 ? `${usd.format(-n)} credit` : usd.format(n)
}

/** Tight rows on paper so a year of monthly dues fits one page. */
const PRINT_CELL = 'print:px-2 print:py-1 print:text-xs'

export type StatementRow = Pick<LedgerEntry, 'id' | 'date' | 'description' | 'charge' | 'payment' | 'balance'>

/** The rows as printed: an opening "Balance forward" line unless the whole history is shown. */
export function statementRows(w: StatementWindow, from: string, all: boolean): StatementRow[] {
  return [
    ...(all
      ? []
      : [{ id: 'forward', date: from, description: 'Balance forward', charge: null, payment: null, balance: w.openingBalance }]),
    ...w.entries,
  ]
}

export interface StatementDocumentProps {
  associationName: string
  statementDate: string
  /** Text under "Period". */
  period: string
  all: boolean
  from: string
  window: StatementWindow
  preparedFor: { name: string | null; email?: string | null }
  homes: string[]
  truncated: boolean
  truncatedNote: string
  emptyHint: string
  footer: string
  /** Extra sections after the table (the resident page's "How to pay"). */
  children?: React.ReactNode
}

export function StatementDocument(props: StatementDocumentProps) {
  const { window: w, all, from } = props
  const rows = statementRows(w, from, all)
  const columns: DataTableColumn<StatementRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => formatDay(r.date), className: `whitespace-nowrap ${PRINT_CELL}` },
    { key: 'description', header: 'Description', mobilePrimary: true, cell: (r) => r.description, className: PRINT_CELL },
    { key: 'charge', header: 'Charge', numeric: true, hideOnMobile: true, cell: (r) => (r.charge != null ? usd.format(r.charge) : ''), className: PRINT_CELL },
    { key: 'payment', header: 'Payment', numeric: true, hideOnMobile: true, cell: (r) => (r.payment != null ? `−${usd.format(r.payment)}` : ''), className: PRINT_CELL },
    // Phone cards only; the table (screen and paper) never shows it.
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      className: 'hidden',
      cell: (r) => (r.charge != null ? usd.format(r.charge) : r.payment != null ? `−${usd.format(r.payment)}` : ''),
    },
    { key: 'balance', header: 'Balance', numeric: true, cell: (r) => balanceText(r.balance), className: PRINT_CELL },
  ]

  return (
    <article
      aria-label="Account statement"
      className="space-y-5 rounded-xl border border-border bg-surface p-5 print:space-y-4 print:rounded-none print:border-0 print:p-0"
    >
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Account statement</p>
          <h2 className="text-lg text-foreground [overflow-wrap:anywhere]">{props.associationName}</h2>
        </div>
        <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm sm:text-right">
          <dt className="text-muted">Statement date</dt>
          <dd className="text-foreground">{formatDay(props.statementDate)}</dd>
          <dt className="text-muted">Period</dt>
          <dd className="text-foreground">{props.period}</dd>
        </dl>
      </header>

      <section className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Prepared for</h3>
          {props.preparedFor.name ? <p className="font-medium text-foreground">{props.preparedFor.name}</p> : null}
          {props.preparedFor.email ? (
            <p className="text-foreground-secondary [overflow-wrap:anywhere]">{props.preparedFor.email}</p>
          ) : null}
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{props.homes.length === 1 ? 'Home' : 'Homes'}</h3>
          <ul>
            {props.homes.map((h, i) => (
              <li key={i} className="text-foreground [overflow-wrap:anywhere]">
                {h}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-4 print:bg-transparent print:p-0">
        <Figure label={all ? 'Opening balance' : 'Balance forward'} value={balanceText(w.openingBalance)} />
        <Figure label="Charges" value={usd.format(w.totals.charges)} />
        <Figure label="Payments & credits" value={`−${usd.format(w.totals.payments + w.totals.credits)}`} />
        <Figure label={w.closingBalance < 0 ? 'Credit balance' : 'Balance due'} value={balanceText(w.closingBalance)} strong />
      </dl>

      <DataTable
        caption="Statement activity, oldest first"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        density="compact"
        mobile="cards"
        className="print:rounded-none print:border-x-0"
        empty={<EmptyState variant="compact" icon={<ReceiptText />} title="No activity in this period" description={props.emptyHint} />}
      />

      {props.truncated ? <p className="text-xs text-muted">{props.truncatedNote}</p> : null}

      {props.children}

      <footer className="border-t border-border pt-3 text-xs text-muted">{props.footer}</footer>
    </article>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? 'num text-lg font-semibold text-foreground' : 'num text-base text-foreground'}>{value}</dd>
    </div>
  )
}
