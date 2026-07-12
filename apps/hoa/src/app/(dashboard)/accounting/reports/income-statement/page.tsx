import Link from 'next/link'
import { ChevronLeft, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { Card, EmptyState, Select } from '@homeowner-portal/ui'
import {
  computeIncomeStatement,
  getAccountingContext,
  listFiscalPeriods,
  type AccountingBasis,
  type ReportLineRow,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Income Statement' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface PageProps {
  searchParams: Promise<{ period?: string; basis?: AccountingBasis }>
}

const BASIS_LABEL: Record<AccountingBasis, string> = {
  accrual: 'Accrual (default)',
  cash: 'Cash',
  modified: 'Modified accrual',
}

export default async function IncomeStatementPage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<TrendingUp className="h-10 w-10" aria-hidden />}
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
          icon={<TrendingUp className="h-10 w-10" aria-hidden />}
          title="No fiscal period configured"
          description="Seed a fiscal period before viewing the income statement."
        />
      </div>
    )
  }

  const basis: AccountingBasis =
    sp.basis === 'cash' || sp.basis === 'modified' ? sp.basis : 'accrual'
  const is = await computeIncomeStatement(ctx.associationId, periodId, basis)

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
        <h1 className="text-2xl font-bold text-foreground">Income Statement</h1>
        <p className="text-sm text-muted">
          {format(new Date(is.startDate), 'MMM d, yyyy')} —{' '}
          {format(new Date(is.endDate), 'MMM d, yyyy')} ·{' '}
          <span className="font-mono">{BASIS_LABEL[is.basis]}</span> basis ·
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
          <label className="flex flex-col gap-1 text-xs text-muted">
            Basis
            <Select
              name="basis"
              defaultValue={basis}
              className="w-full sm:w-56"
            >
              <option value="accrual">Accrual</option>
              <option value="cash">Cash</option>
              <option value="modified">Modified accrual</option>
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
            <tbody>
            <tr className="bg-background/30">
              <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Income
              </td>
            </tr>
            <Rows rows={is.income} />
            <tr className="border-b-2 border-border bg-background/20">
              <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">
                Total income
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {currency(is.totalIncome)}
              </td>
            </tr>

            <tr className="bg-background/30">
              <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Expenses
              </td>
            </tr>
            <Rows rows={is.expenses} />
            <tr className="border-b-2 border-border bg-background/20">
              <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">
                Total expenses
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {currency(is.totalExpenses)}
              </td>
            </tr>

            <tr className="border-t-2 border-border bg-background/40">
              <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Net income
              </td>
              <td
                className={`px-4 py-2 text-right font-mono text-base font-semibold ${is.netIncome < 0 ? 'text-destructive' : 'text-emerald-600'}`}
              >
                {currency(is.netIncome)}
              </td>
            </tr>
          </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Rows({ rows }: { rows: ReportLineRow[] }) {
  if (rows.length === 0) {
    return (
      <tr className="border-b border-border">
        <td colSpan={2} className="px-4 py-1 text-xs italic text-muted">
          (none)
        </td>
      </tr>
    )
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={r.accountId} className="border-b border-border">
          <td className="px-4 py-1">
            <span className="font-mono text-xs text-muted">{r.accountNumber}</span>{' '}
            {r.accountName}
          </td>
          <td className="px-4 py-1 text-right font-mono text-foreground">
            {r.balance.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 2,
            })}
          </td>
        </tr>
      ))}
    </>
  )
}
