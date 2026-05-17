import Link from 'next/link'
import { CalendarClock, ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listFiscalPeriods,
} from '@/lib/accounting/queries'
import { ClosePeriodButton } from './ClosePeriodButton'

export const metadata = { title: 'Fiscal Periods' }

export default async function PeriodsPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<CalendarClock className="h-10 w-10" aria-hidden />}
          title="No fiscal periods yet"
          description="This area is empty. Contact support to set up accounting for your association."
        />
      </div>
    )
  }

  const periods = await listFiscalPeriods(ctx.associationId)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <h1>Fiscal Periods</h1>
        <p className="text-sm text-muted">
          Closing a period emits Income→Equity and Expense→Equity journal
          entries per fund. Closed periods can still receive reversing entries.
        </p>
      </header>

      {periods.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-10 w-10" aria-hidden />}
          title="No fiscal periods"
          description="Seeding creates one period per association for the current calendar year."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Start</th>
                <th className="px-4 py-2 font-medium">End</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Closed</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">
                    {format(new Date(p.start_date), 'PP')}
                  </td>
                  <td className="px-4 py-2 text-foreground">
                    {format(new Date(p.end_date), 'PP')}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        p.status === 'closed'
                          ? 'success'
                          : p.status === 'closing'
                            ? 'warning'
                            : 'outline'
                      }
                      size="sm"
                    >
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {p.closed_at ? format(new Date(p.closed_at), 'PP') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/api/accounting/board-packet/${p.id}`}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:bg-background"
                        title="Download board-packet PDF"
                      >
                        PDF
                      </a>
                      {p.status === 'open' ? <ClosePeriodButton periodId={p.id} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
