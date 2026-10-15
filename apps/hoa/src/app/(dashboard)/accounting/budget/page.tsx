import Link from 'next/link'
import { Plus, Target } from 'lucide-react'
import { Button, DataTable, EmptyState, LoadFailed, Page, type DataTableColumn } from '@homeowner-portal/ui'
import { getAccountingContext, listBudgets, type BudgetSummary } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatStamp, periodLabel, usd } from '@/lib/money/format'
import { BUDGET_STATUS } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from '../_components/shared'

export const metadata = { title: 'Budgets' }
export const dynamic = 'force-dynamic'

const COLUMNS: DataTableColumn<BudgetSummary>[] = [
  {
    key: 'name',
    header: 'Budget',
    mobilePrimary: true,
    cell: (b) => (
      <Link href={`/accounting/budget/${b.id}`} className="font-medium text-foreground no-underline hover:text-primary hover:underline">
        {b.fund?.name ?? 'Unknown fund'}
      </Link>
    ),
  },
  { key: 'period', header: 'Period', className: 'whitespace-nowrap text-muted', cell: (b) => (b.fiscalPeriod ? periodLabel(b.fiscalPeriod) : '—') },
  { key: 'lines', header: 'Lines', numeric: true, hideBelowLg: true, cell: (b) => b.lineItemCount },
  { key: 'total', header: 'Total budgeted', numeric: true, cell: (b) => usd(b.totalAmount, { whole: true }) },
  { key: 'approved', header: 'Approved', hideBelowLg: true, className: 'whitespace-nowrap text-muted', cell: (b) => (b.approved_at ? formatStamp(b.approved_at) : '—') },
  { key: 'status', header: 'Status', cell: (b) => <MoneyStatus registry={BUDGET_STATUS} status={b.status} /> },
]

export default async function BudgetsListPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Budgets" what="budgets" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Budgets" />

  const res = await tryLoad('budgets', () => listBudgets(ctx.associationId))

  return (
    <Page
      title="Budgets"
      description="One budget per fund and fiscal period. Approving locks it, and Budget vs. actual compares spending against it."
      tabs={<AccountingTabs />}
      actions={
        <Button asChild>
          <Link href="/accounting/budget/new">
            <Plus aria-hidden />
            New budget
          </Link>
        </Button>
      }
    >
      {!res.ok ? (
        <LoadFailed what="budgets" />
      ) : (
        <DataTable
          caption="Budgets"
          mobile="cards"
          columns={COLUMNS}
          rows={res.data}
          rowKey={(b) => b.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<Target aria-hidden />}
              title="No budgets yet"
              description="Start with the operating fund for this year. Approve it once the board signs off, and variance reports stay stable."
            />
          }
        />
      )}
    </Page>
  )
}
