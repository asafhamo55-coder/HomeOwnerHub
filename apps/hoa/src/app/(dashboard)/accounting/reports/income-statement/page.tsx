import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { EmptyState, Field, Kpi, LoadFailed, Page, Select, StatementTable, filterFieldClass } from '@homeowner-portal/ui'
import {
  computeIncomeStatement,
  getAccountingContext,
  listFiscalPeriods,
  type AccountingBasis,
  type ReportLineRow,
} from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, periodLabel, usd } from '@/lib/money/format'
import { AccountLabel, AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { PeriodFilter } from '../../_components/PeriodFilter'

export const metadata = { title: 'Income Statement' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string; basis?: AccountingBasis }>
}

const BASIS: Record<AccountingBasis, { label: string; hint: string }> = {
  accrual: { label: 'Accrual', hint: 'Income when billed, expenses when billed.' },
  cash: { label: 'Cash', hint: 'Only entries that moved cash.' },
  modified: { label: 'Modified accrual', hint: 'Income when collected, expenses when billed.' },
}

const rowsOf = (rows: ReportLineRow[]) =>
  rows.map((r) => ({ key: r.accountId, label: <AccountLabel number={r.accountNumber} name={r.accountName} />, values: { amt: usd(r.balance) } }))

export default async function IncomeStatementPage({ searchParams }: PageProps) {
  const crumbs = accountingCrumbs(['Reports', '/accounting/reports'], ['Income statement'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Income statement" what="the income statement" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Income statement" />

  const sp = await searchParams
  const periodsRes = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))
  if (!periodsRes.ok) return <AccountingLoadFailed title="Income statement" what="the income statement" breadcrumbs={crumbs} />
  const periods = periodsRes.data
  const periodId = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : ctx.currentPeriod?.id
  const period = periods.find((p) => p.id === periodId)
  if (!periodId || !period) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title="Income statement">
        <EmptyState icon={<TrendingUp aria-hidden />} title="No fiscal period yet" description="An income statement covers one fiscal period. Contact support to open the first one." />
      </Page>
    )
  }

  const basis: AccountingBasis = sp.basis === 'cash' || sp.basis === 'modified' ? sp.basis : 'accrual'
  const res = await tryLoad('income statement', () => computeIncomeStatement(ctx.associationId, periodId, basis))

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Income statement"
      description={`${periodLabel(period)} · ${formatDayRange(period.start_date, period.end_date)} · ${BASIS[basis].label} basis — ${BASIS[basis].hint.toLowerCase()}`}
    >
      <PeriodFilter periods={periods} periodId={periodId} resetHref="/accounting/reports/income-statement" filtered={Boolean(sp.period || sp.basis)}>
        <Field label="Basis" className={filterFieldClass}>
          <Select name="basis" defaultValue={basis}>
            {(Object.keys(BASIS) as AccountingBasis[]).map((b) => (
              <option key={b} value={b}>
                {BASIS[b].label}
              </option>
            ))}
          </Select>
        </Field>
      </PeriodFilter>

      {!res.ok ? (
        <LoadFailed what="the income statement" />
      ) : (
        <>
          <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Kpi label="Income" value={usd(res.data.totalIncome, { whole: true })} />
            <Kpi label="Expenses" value={usd(res.data.totalExpenses, { whole: true })} />
            <Kpi
              label={res.data.netIncome < 0 ? 'Net loss' : 'Net income'}
              value={<span className={res.data.netIncome < 0 ? 'text-danger' : undefined}>{usd(res.data.netIncome, { whole: true })}</span>}
            />
          </section>
          <StatementTable
            caption={`Income statement, ${periodLabel(period)}`}
            columns={[{ key: 'amt', header: 'Amount' }]}
            sections={[
              { key: 'income', title: 'Income', rows: rowsOf(res.data.income), subtotal: { label: 'Total income', values: { amt: usd(res.data.totalIncome) } } },
              { key: 'expenses', title: 'Expenses', rows: rowsOf(res.data.expenses), subtotal: { label: 'Total expenses', values: { amt: usd(res.data.totalExpenses) } } },
            ]}
            totals={[
              {
                key: 'net',
                label: res.data.netIncome < 0 ? 'Net loss' : 'Net income',
                values: { amt: <span className={res.data.netIncome < 0 ? 'text-danger' : undefined}>{usd(res.data.netIncome)}</span> },
              },
            ]}
          />
        </>
      )}
    </Page>
  )
}
