import Link from 'next/link'
import { ArrowDownUp, ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'
import { Card, EmptyState, Select } from '@homeowner-portal/ui'
import {
  computeCashFlow,
  getAccountingContext,
  listFiscalPeriods,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Cash Flow' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual entries',
  ap_invoice: 'Bill payments (AP)',
  ar_payment: 'Resident payments (AR)',
  bank_rec: 'Bank reconciliation',
  recurring: 'Recurring entries',
  closing: 'Closing entries',
  reversing: 'Reversing entries',
}

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function CashFlowPage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<ArrowDownUp className="h-10 w-10" aria-hidden />}
          title="No data yet"
          description="Run pnpm seed:accounting first."
        />
      </div>
    )
  }

  const sp = await searchParams
  const periods = await listFiscalPeriods(ctx.associationId)
  const periodId =
    sp.period && periods.some((p) => p.id === sp.period)
      ? sp.period
      : ctx.currentPeriod?.id

  if (!periodId) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<ArrowDownUp className="h-10 w-10" aria-hidden />}
          title="No fiscal period configured"
          description="Seed a fiscal period before viewing cash flow."
        />
      </div>
    )
  }

  const cf = await computeCashFlow(ctx.associationId, periodId)

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
        <h1 className="text-2xl font-bold text-foreground">Cash Flow</h1>
        <p className="text-sm text-muted">
          {format(new Date(cf.startDate), 'MMM d, yyyy')} —{' '}
          {format(new Date(cf.endDate), 'MMM d, yyyy')} · direct method,
          posted entries only
        </p>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Period
            <Select
              name="period"
              defaultValue={periodId}
              className="w-full sm:w-56"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {format(new Date(p.start_date), 'yyyy')} · {p.status}
                </option>
              ))}
            </Select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary/90"
          >
            Refresh
          </button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 text-right font-medium">Inflows</th>
              <th className="px-4 py-2 text-right font-medium">Outflows</th>
              <th className="px-4 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border bg-background/20">
              <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">
                Opening cash
              </td>
              <td colSpan={3} className="px-4 py-2 text-right font-mono text-foreground">
                {currency(cf.openingCash)}
              </td>
            </tr>
            {cf.rows.length === 0 ? (
              <tr className="border-b border-border">
                <td colSpan={4} className="px-4 py-3 text-xs italic text-muted">
                  No cash movements in this period.
                </td>
              </tr>
            ) : (
              cf.rows.map((r) => (
                <tr key={r.source} className="border-b border-border">
                  <td className="px-4 py-1">
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </td>
                  <td className="px-4 py-1 text-right font-mono text-foreground">
                    {r.inflow > 0 ? currency(r.inflow) : '—'}
                  </td>
                  <td className="px-4 py-1 text-right font-mono text-muted">
                    {r.outflow > 0 ? currency(r.outflow) : '—'}
                  </td>
                  <td
                    className={`px-4 py-1 text-right font-mono ${r.net < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                  >
                    {currency(r.net)}
                  </td>
                </tr>
              ))
            )}
            <tr className="border-t-2 border-border bg-background/40">
              <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Net change in cash
              </td>
              <td colSpan={2} />
              <td
                className={`px-4 py-2 text-right font-mono font-semibold ${cf.totalNet < 0 ? 'text-destructive' : 'text-emerald-600'}`}
              >
                {currency(cf.totalNet)}
              </td>
            </tr>
            <tr className="bg-background/20">
              <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">
                Closing cash
              </td>
              <td colSpan={3} className="px-4 py-2 text-right font-mono font-semibold">
                {currency(cf.closingCash)}
              </td>
            </tr>
          </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
