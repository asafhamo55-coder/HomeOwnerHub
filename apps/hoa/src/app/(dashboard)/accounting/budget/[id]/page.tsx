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
import { AdoptionKit } from './AdoptionKit'
import { getCurrentUserRole } from '@/lib/auth'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  listUpcomingMeetings,
  loadAdoptionKit,
  readAdoptionAssociation,
  type LooseDb,
} from '@/lib/budget-adoption/load'

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

  // BL-138: the adoption kit, for the board on a draft or approved budget.
  const showKit = budget.status === 'draft' || budget.status === 'approved'
  const kit = showKit ? await loadKitFor(ctx, { id: budget.id, status: budget.status, periodStart: budget.fiscalPeriod?.start_date ?? null }) : null

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
      {kit ? (
        <div className="mb-6">
          <AdoptionKit budgetId={budget.id} loaded={kit.loaded} upcoming={kit.upcoming} today={kit.today} />
        </div>
      ) : null}
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

/**
 * BL-138: the adoption kit's reads. Null when the viewer isn't board or
 * admin (the kit is board-only); `loaded: null` when a read failed.
 */
async function loadKitFor(
  ctx: { organizationId: string; associationId: string; timeZone: string },
  budget: { id: string; status: string; periodStart: string | null },
) {
  const role = await getCurrentUserRole()
  if (!role || (role.role !== 'board' && role.role !== 'admin')) return null
  const db = (await getSupabaseServerClient()) as unknown as LooseDb
  const today = todayIn(ctx.timeZone)
  const [assoc, upcoming] = await Promise.all([
    readAdoptionAssociation(db, ctx.associationId),
    listUpcomingMeetings(db, ctx.organizationId, today),
  ])
  if (!assoc.ok || !assoc.row) return { loaded: null, upcoming, today }
  const loaded = await loadAdoptionKit(db, {
    orgId: ctx.organizationId,
    association: assoc.row,
    timeZone: ctx.timeZone,
    today,
    budget,
  })
  return { loaded, upcoming, today }
}
