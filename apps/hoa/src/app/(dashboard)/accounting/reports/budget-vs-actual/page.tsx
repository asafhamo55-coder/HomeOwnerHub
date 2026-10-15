import Link from 'next/link'
import { Plus, Scale } from 'lucide-react'
import { Button, EmptyState, Field, FilterBar, Kpi, LoadFailed, Page, Select, StatementTable, filterFieldClass } from '@homeowner-portal/ui'
import { computeBudgetVsActual, getAccountingContext, listBudgets, type BudgetVsActualRow } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, periodLabel, signTone, usd, usdSigned } from '@/lib/money/format'
import { BUDGET_STATUS, statusOf } from '@/lib/money/status'
import { AccountLabel, AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'

export const metadata = { title: 'Budget vs Actual' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ budget?: string }>
}

const variance = (n: number) => <span className={signTone(n)}>{usdSigned(n, { whole: true })}</span>

const rowsOf = (rows: BudgetVsActualRow[]) =>
  rows.map((r) => ({
    key: r.accountId,
    label: <AccountLabel number={r.accountNumber} name={r.accountName} />,
    values: { b: usd(r.budgeted, { whole: true }), a: usd(r.actual, { whole: true }), v: variance(r.variance) },
  }))

export default async function BudgetVsActualPage({ searchParams }: PageProps) {
  const crumbs = accountingCrumbs(['Reports', '/accounting/reports'], ['Budget vs. actual'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Budget vs. actual" what="the report" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Budget vs. actual" />

  const sp = await searchParams
  const budgetsRes = await tryLoad('budgets', () => listBudgets(ctx.associationId))
  if (!budgetsRes.ok) return <AccountingLoadFailed title="Budget vs. actual" what="budgets" breadcrumbs={crumbs} />
  const budgets = budgetsRes.data
  if (budgets.length === 0) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title="Budget vs. actual">
        <EmptyState
          icon={<Scale aria-hidden />}
          title="No budget to compare against"
          description="Create a budget for the year and this report shows each line next to what was actually collected or spent."
          action={
            <Button asChild>
              <Link href="/accounting/budget/new">
                <Plus aria-hidden />
                New budget
              </Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const budgetId = sp.budget && budgets.some((b) => b.id === sp.budget) ? sp.budget : budgets[0].id
  const res = await tryLoad('budget vs actual', () => computeBudgetVsActual(ctx.associationId, budgetId))
  const budgetName = (b: (typeof budgets)[number]) =>
    `${b.fund?.name ?? 'Unknown fund'}${b.fiscalPeriod ? ` · ${periodLabel(b.fiscalPeriod)}` : ''} · ${statusOf(BUDGET_STATUS, b.status).label}`

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Budget vs. actual"
      description={
        res.ok && res.data
          ? `${res.data.startDate ? formatDayRange(res.data.startDate, res.data.endDate) : ''} · posted entries only. Variance is positive when it helps: income above plan, or spending below it.`
          : 'Each budget line next to what was actually collected or spent.'
      }
    >
      <FilterBar resetHref="/accounting/reports/budget-vs-actual" filtered={Boolean(sp.budget)} linkAs={Link} label="Report options">
        <Field label="Budget" className="w-full sm:w-80">
          <Select name="budget" defaultValue={budgetId}>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {budgetName(b)}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {!res.ok ? (
        <LoadFailed what="the report" />
      ) : !res.data ? (
        <EmptyState icon={<Scale aria-hidden />} title="Budget not found" description="That budget isn’t part of this association. Pick another above." />
      ) : res.data.rows.length === 0 ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title="This budget has no lines yet"
          description="Add income and expense lines to the budget to compare them against the ledger."
          action={
            <Button asChild variant="secondary">
              <Link href={`/accounting/budget/${budgetId}`}>Edit budget</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Kpi label="Budgeted net" value={usd(res.data.totals.budgetedNet, { whole: true })} />
            <Kpi label="Actual net" value={usd(res.data.totals.actualNet, { whole: true })} />
            <Kpi
              label="Variance"
              value={variance(res.data.totals.varianceNet)}
              hint={res.data.totals.varianceNet >= 0 ? 'Ahead of plan' : 'Behind plan'}
            />
          </section>
          <StatementTable
            caption="Budget vs. actual"
            columns={[
              { key: 'b', header: 'Budget' },
              { key: 'a', header: 'Actual' },
              { key: 'v', header: 'Variance' },
            ]}
            sections={[
              {
                key: 'income',
                title: 'Income',
                rows: rowsOf(res.data.rows.filter((r) => r.accountType === 'income')),
                subtotal: {
                  label: 'Total income',
                  values: {
                    b: usd(res.data.totals.budgetedIncome, { whole: true }),
                    a: usd(res.data.totals.actualIncome, { whole: true }),
                    v: variance(res.data.totals.actualIncome - res.data.totals.budgetedIncome),
                  },
                },
              },
              {
                key: 'expense',
                title: 'Expenses',
                rows: rowsOf(res.data.rows.filter((r) => r.accountType === 'expense')),
                // Favourable = spent less than budgeted. The old subtotal used
                // actual − budget here, so overspending showed green.
                subtotal: {
                  label: 'Total expenses',
                  values: {
                    b: usd(res.data.totals.budgetedExpense, { whole: true }),
                    a: usd(res.data.totals.actualExpense, { whole: true }),
                    v: variance(res.data.totals.budgetedExpense - res.data.totals.actualExpense),
                  },
                },
              },
            ]}
            totals={[
              {
                key: 'net',
                label: 'Net surplus (deficit)',
                values: {
                  b: usd(res.data.totals.budgetedNet, { whole: true }),
                  a: usd(res.data.totals.actualNet, { whole: true }),
                  v: variance(res.data.totals.varianceNet),
                },
              },
            ]}
          />
        </>
      )}
    </Page>
  )
}
