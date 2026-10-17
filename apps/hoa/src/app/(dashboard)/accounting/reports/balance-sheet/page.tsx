import Link from 'next/link'
import { Alert, Field, FilterBar, Input, Kpi, LoadFailed, Page, StatementTable, StatusPill, filterFieldClass } from '@homeowner-portal/ui'
import { computeBalanceSheet, getAccountingContext, type ReportLineRow } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay, todayIso, usd } from '@/lib/money/format'
import { AccountLabel, AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'

export const metadata = { title: 'Balance Sheet' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ asOf?: string }>
}

const rowsOf = (rows: ReportLineRow[]) =>
  rows.map((r) => ({ key: r.accountId, label: <AccountLabel number={r.accountNumber} name={r.accountName} />, values: { bal: usd(r.balance) } }))

export default async function BalanceSheetPage({ searchParams }: PageProps) {
  const crumbs = accountingCrumbs(['Reports', '/accounting/reports'], ['Balance sheet'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Balance sheet" what="the balance sheet" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Balance sheet" returnTo="/accounting/reports/balance-sheet" />

  const sp = await searchParams
  // Default is today: "where do we stand" is the question this page answers.
  // (It used to default to the end of the newest period — a date in the
  // future for an open year.)
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : todayIso(ctx.timeZone)
  const res = await tryLoad('balance sheet', () => computeBalanceSheet(ctx.associationId, asOf))

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Balance sheet"
      description={`As of ${formatDay(asOf)} · posted entries only. Assets must equal liabilities plus equity.`}
      meta={res.ok ? res.data.isBalanced ? <StatusPill tone="success" label="Balanced" /> : <StatusPill tone="danger" label="Out of balance" /> : undefined}
    >
      <FilterBar resetHref="/accounting/reports/balance-sheet" filtered={Boolean(sp.asOf)} linkAs={Link} label="Report options">
        <Field label="As of" className={filterFieldClass}>
          <Input type="date" name="asOf" defaultValue={asOf} />
        </Field>
      </FilterBar>

      {!res.ok ? (
        <LoadFailed what="the balance sheet" />
      ) : (
        <>
          <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Kpi label="Total assets" value={usd(res.data.totalAssets, { whole: true })} />
            <Kpi label="Total liabilities" value={usd(res.data.totalLiabilities, { whole: true })} />
            <Kpi label="Total equity" value={usd(res.data.totalEquity, { whole: true })} hint="Including net income to date" />
          </section>
          {!res.data.isBalanced ? (
            <Alert variant="error" title="Assets don’t equal liabilities plus equity">
              The database should make this impossible. Contact support before relying on these figures.
            </Alert>
          ) : null}
          <StatementTable
            caption={`Balance sheet as of ${formatDay(asOf)}`}
            columns={[{ key: 'bal', header: 'Balance' }]}
            sections={[
              { key: 'assets', title: 'Assets', rows: rowsOf(res.data.assets), subtotal: { label: 'Total assets', values: { bal: usd(res.data.totalAssets) } } },
              {
                key: 'liabilities',
                title: 'Liabilities',
                rows: rowsOf(res.data.liabilities),
                subtotal: { label: 'Total liabilities', values: { bal: usd(res.data.totalLiabilities) } },
              },
              {
                key: 'equity',
                title: 'Equity',
                rows: [
                  ...rowsOf(res.data.equity),
                  {
                    key: 'ni',
                    label: <span className="block pl-[2.875rem] italic text-foreground-secondary">Net income, period to date</span>,
                    values: { bal: usd(res.data.netIncomePtd) },
                  },
                ],
                subtotal: { label: 'Total equity', values: { bal: usd(res.data.totalEquity) } },
              },
            ]}
            totals={[{ key: 'le', label: 'Total liabilities + equity', values: { bal: usd(res.data.totalLiabilities + res.data.totalEquity) } }]}
          />
        </>
      )}
    </Page>
  )
}
