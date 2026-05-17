import Link from 'next/link'
import { ChevronLeft, Scale } from 'lucide-react'
import { format } from 'date-fns'
import { Card, EmptyState } from '@homeowner-portal/ui'
import {
  computeBudgetVsActual,
  getAccountingContext,
  listBudgets,
  type BudgetVsActualRow,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Budget vs Actual' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

interface PageProps {
  searchParams: Promise<{ budget?: string }>
}

export default async function BudgetVsActualPage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="No data yet"
          description="Run pnpm seed:accounting first."
        />
      </div>
    )
  }

  const sp = await searchParams
  const budgets = await listBudgets(ctx.associationId)
  if (budgets.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="No budgets to compare"
          description="Create a budget under Accounting → Budgets first."
          action={
            <Link
              href="/accounting/budget/new"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary/90"
            >
              New budget
            </Link>
          }
        />
      </div>
    )
  }

  const budgetId = sp.budget && budgets.some((b) => b.id === sp.budget) ? sp.budget : budgets[0].id
  const bva = await computeBudgetVsActual(ctx.associationId, budgetId)

  if (!bva) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="Budget not found"
          description="That budget couldn't be loaded for this association."
        />
      </div>
    )
  }

  const incomeRows = bva.rows.filter((r) => r.accountType === 'income')
  const expenseRows = bva.rows.filter((r) => r.accountType === 'expense')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Budget vs Actual</h1>
        <p className="text-sm text-muted">
          {bva.fundCode ? `${bva.fundCode} fund · ` : ''}
          {bva.startDate ? format(new Date(bva.startDate), 'MMM d, yyyy') : ''} —{' '}
          {bva.endDate ? format(new Date(bva.endDate), 'MMM d, yyyy') : ''} ·
          posted entries only · favorable variance is positive
        </p>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Budget
            <select
              name="budget"
              defaultValue={budgetId}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fund?.code ?? '—'} ·{' '}
                  {b.fiscalPeriod ? new Date(b.fiscalPeriod.start_date).getFullYear() : '—'} ·{' '}
                  {b.status}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary/90"
          >
            Refresh
          </button>
        </form>
      </Card>

      {bva.rows.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="No line items"
          description="Add line items to this budget to compare against actuals."
          action={
            <Link
              href={`/accounting/budget/${budgetId}`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary/90"
            >
              Edit budget
            </Link>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 text-right font-medium">Budget</th>
                <th className="px-4 py-2 text-right font-medium">Actual</th>
                <th className="px-4 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              <SectionHeader label="Income" />
              <Rows rows={incomeRows} />
              <Subtotal
                label="Total income"
                budgeted={bva.totals.budgetedIncome}
                actual={bva.totals.actualIncome}
              />

              <SectionHeader label="Expenses" />
              <Rows rows={expenseRows} />
              <Subtotal
                label="Total expenses"
                budgeted={bva.totals.budgetedExpense}
                actual={bva.totals.actualExpense}
              />

              <tr className="border-t-2 border-border bg-background/40">
                <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Net surplus / (deficit)
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold">
                  {currency(bva.totals.budgetedNet)}
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold">
                  {currency(bva.totals.actualNet)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono font-semibold ${bva.totals.varianceNet < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                >
                  {currency(bva.totals.varianceNet)}
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-background/30">
      <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </td>
    </tr>
  )
}

function Rows({ rows }: { rows: BudgetVsActualRow[] }) {
  if (rows.length === 0) {
    return (
      <tr className="border-b border-border">
        <td colSpan={4} className="px-4 py-1 text-xs italic text-muted">
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
            {r.budgeted.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </td>
          <td className="px-4 py-1 text-right font-mono text-foreground">
            {r.actual.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </td>
          <td
            className={`px-4 py-1 text-right font-mono ${r.variance < 0 ? 'text-destructive' : 'text-emerald-600'}`}
          >
            {r.variance.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </td>
        </tr>
      ))}
    </>
  )
}

function Subtotal({
  label,
  budgeted,
  actual,
}: {
  label: string
  budgeted: number
  actual: number
}) {
  const variance = actual - budgeted
  return (
    <tr className="border-b-2 border-border bg-background/20">
      <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">{label}</td>
      <td className="px-4 py-2 text-right font-mono font-semibold">{currency(budgeted)}</td>
      <td className="px-4 py-2 text-right font-mono font-semibold">{currency(actual)}</td>
      <td
        className={`px-4 py-2 text-right font-mono font-semibold ${variance < 0 ? 'text-destructive' : 'text-emerald-600'}`}
      >
        {currency(variance)}
      </td>
    </tr>
  )
}
