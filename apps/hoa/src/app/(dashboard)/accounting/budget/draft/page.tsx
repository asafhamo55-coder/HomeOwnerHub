import Link from 'next/link'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { loadBudgetDraftInputs } from '@/lib/accounting/budget-draft-data'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, periodLabel, todayIso } from '@/lib/money/format'
import { statusOf, BUDGET_STATUS } from '@/lib/money/status'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { BudgetDraftEditor } from './BudgetDraftEditor'

export const metadata = { title: 'Draft next year’s budget' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ fund?: string; period?: string }>
}

const TITLE = 'Draft next year’s budget'
const DESCRIPTION = 'A first draft from last year’s budget and the last 12 months of actuals, with the reason for every line. Review and edit it, then save it as a draft.'

export default async function BudgetDraftPage({ searchParams }: PageProps) {
  const crumbs = accountingCrumbs(['Budgets', '/accounting/budget'], ['Draft next year'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title={TITLE} what="the budget draft" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title={TITLE} tabs={false} returnTo="/accounting/budget/draft" />

  const sp = await searchParams
  const today = todayIso(ctx.timeZone)
  const res = await tryLoad('budget draft inputs', () =>
    loadBudgetDraftInputs({ associationId: ctx.associationId, fundId: sp.fund ?? null, targetPeriodId: sp.period ?? null, today }),
  )

  if (!res.ok) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title={TITLE} description={DESCRIPTION}>
        <LoadFailed what="last year’s budget and actuals" />
      </Page>
    )
  }
  const d = res.data
  if (!d.fund) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title={TITLE} description={DESCRIPTION}>
        <LoadFailed what="your funds — none are set up for this association" />
      </Page>
    )
  }

  const toLabel = (p: { startDate: string; endDate: string }) => periodLabel({ start_date: p.startDate, end_date: p.endDate })
  const yearLabel = d.target ? toLabel(d.target) : d.nextYearMissing ? toLabel(d.nextYearMissing) : 'next year'
  const sourceLabel = d.source ? `${toLabel(d.source)} budget (${statusOf(BUDGET_STATUS, d.source.status).label.toLowerCase()})` : null

  return (
    <Page linkAs={Link} breadcrumbs={crumbs} title={TITLE} description={DESCRIPTION}>
      <BudgetDraftEditor
        // A new fund or year is a new draft: reset the editor's state.
        key={`${d.fund.id}:${d.target?.id ?? 'none'}`}
        funds={d.funds.map((f) => ({ id: f.id, name: f.name }))}
        fundId={d.fund.id}
        fundName={d.fund.name}
        targets={d.targets.map((t) => ({ id: t.id, label: toLabel(t) }))}
        targetId={d.target?.id ?? null}
        yearLabel={yearLabel}
        nextYearMissingLabel={d.nextYearMissing ? toLabel(d.nextYearMissing) : null}
        sourceLabel={sourceLabel}
        windowLabel={formatDayRange(d.window.from, d.window.through)}
        source={d.draftSource}
      />
    </Page>
  )
}
