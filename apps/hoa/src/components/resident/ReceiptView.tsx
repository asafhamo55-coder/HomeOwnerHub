import { balanceLabel } from '@/lib/resident-notify/receipt-render'
import { formatDay, usd } from '@/lib/money/format'
import type { ResidentReceipt } from '@/lib/resident-receipt'

/**
 * The printable payment receipt. Plain markup and print styles, like the
 * statement: the resident layout's chrome is print:hidden and the card frame
 * drops on paper.
 */
export function ReceiptView({ receipt: r }: { receipt: ResidentReceipt }) {
  return (
    <article
      aria-label="Payment receipt"
      className="space-y-5 rounded-xl border border-border bg-surface p-5 print:space-y-4 print:rounded-none print:border-0 print:p-0"
    >
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment receipt</p>
          <h2 className="text-lg text-foreground [overflow-wrap:anywhere]">{r.associationName ?? 'Your association'}</h2>
        </div>
        <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm sm:text-right">
          <dt className="text-muted">Receipt number</dt>
          <dd className="num text-foreground">{r.receiptNumber}</dd>
          <dt className="text-muted">Date received</dt>
          <dd className="text-foreground">{formatDay(r.paidDay)}</dd>
        </dl>
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-4 print:bg-transparent print:p-0">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Amount received</dt>
          <dd className="num text-lg font-semibold text-foreground">{usd(r.amount)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Paid by</dt>
          <dd className="text-base text-foreground">{r.methodLabel}</dd>
        </div>
        {r.propertyLabel ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted">Property</dt>
            <dd className="text-base text-foreground [overflow-wrap:anywhere]">{r.propertyLabel}</dd>
          </div>
        ) : null}
      </dl>

      <section className="space-y-1.5 text-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Applied to</h3>
        <ul className="divide-y divide-border">
          {r.allocations.map((a) => (
            <li key={`${a.label}-${a.dueDate}`} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 text-foreground">
                {a.label}
                <span className="block text-xs text-muted">Due {formatDay(a.dueDate)}</span>
              </span>
              <span className="num shrink-0 text-foreground">{usd(a.applied)}</span>
            </li>
          ))}
          {r.credit > 0 ? (
            <li className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-foreground">Credit on your account</span>
              <span className="num shrink-0 text-foreground">{usd(r.credit)}</span>
            </li>
          ) : null}
        </ul>
      </section>

      {r.balanceAfter !== null ? (
        <p className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
          <span className="text-muted">Account balance after this payment</span>
          <span className="num font-semibold text-foreground">{balanceLabel(r.balanceAfter)}</span>
        </p>
      ) : null}

      <footer className="border-t border-border pt-3 text-xs text-muted">
        Keep this receipt for your records. Your ledger shows every charge and payment on your account.
      </footer>
    </article>
  )
}
