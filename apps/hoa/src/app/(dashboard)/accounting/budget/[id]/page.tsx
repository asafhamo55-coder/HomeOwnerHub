import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarChart3, Megaphone } from 'lucide-react'
import { Button, Page, StatusPill } from '@homeowner-portal/ui'
import { getAccountingContext, getBudget, listAccounts } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatStamp, periodLabel } from '@/lib/money/format'
import { BUDGET_STATUS, statusOf } from '@/lib/money/status'
import { AccountingLoadFailed, accountingCrumbs } from '../../_components/shared'
import { BudgetEditor } from './BudgetEditor'
import { BudgetActions } from './BudgetActions'

export const metadata = { title: 'Budget' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetDetailPage({ params }: PageProps) {
  const { id } = await params
  const crumbs = accountingCrumbs(['Budgets', '/accounting/budget'], ['Budget'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Budget" what="this budget" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) notFound()
  const [budgetRes, accountsRes] = await Promise.all([
    tryLoad('budget', () => getBudget(ctx.associationId, id)),
    tryLoad('chart of accounts', () => listAccounts(ctx.associationId)),
  ])
  if (!budgetRes.ok || !accountsRes.ok) return <AccountingLoadFailed title="Budget" what="this budget" breadcrumbs={crumbs} />
  const budget = budgetRes.data
  if (!budget) notFound()

  // Income + expense accounts only — a manager budgets what flows through
  // the P&L, not balances like cash.
  const budgetableAccounts = accountsRes.data
    .filter((a) => a.is_active && (a.account_type === 'income' || a.account_type === 'expense'))
    .map((a) => ({ id: a.id, label: `${a.account_number} — ${a.account_name}`, type: a.account_type as 'income' | 'expense' }))

  const isEditable = budget.status === 'draft'
  const status = statusOf(BUDGET_STATUS, budget.status)
  const name = `${budget.fund?.name ?? 'Budget'}${budget.fiscalPeriod ? ` · ${periodLabel(budget.fiscalPeriod)}` : ''}`

  return (
    <Page
      width="default"
      linkAs={Link}
      breadcrumbs={accountingCrumbs(['Budgets', '/accounting/budget'], [name])}
      title={name}
      meta={<StatusPill tone={status.tone} label={status.label} />}
      description={budget.approved_at ? `Approved ${formatStamp(budget.approved_at)}.` : 'Draft — edit the lines, save, then approve when the board signs off.'}
      actions={
        <>
          {isEditable ? <BudgetActions budgetId={budget.id} name={name} /> : null}
          {budget.status === 'approved' ? (
            <Button asChild variant="secondary">
              <Link href={`/accounting/budget/${budget.id}/notice`}>
                <Megaphone aria-hidden />
                Prepare owner budget notice
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href={`/accounting/reports/budget-vs-actual?budget=${budget.id}`}>
              <BarChart3 aria-hidden />
              Budget vs. actual
            </Link>
          </Button>
        </>
      }
    >
      <BudgetEditor
        budgetId={budget.id}
        editable={isEditable}
        initial={budget.lineItems.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          amount: l.amount,
          notes: l.notes ?? '',
          accountLabel: `${l.accountNumber} — ${l.accountName}`,
          accountType: l.accountType as 'income' | 'expense',
        }))}
        accounts={budgetableAccounts}
      />
    </Page>
  )
}
