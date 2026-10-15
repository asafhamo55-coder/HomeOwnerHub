import Link from 'next/link'
import { Card, CardContent, Page } from '@homeowner-portal/ui'
import { getAccountingContext, listFiscalPeriods, listFunds } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { periodLabel } from '@/lib/money/format'
import { statusOf, PERIOD_STATUS } from '@/lib/money/status'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { NewBudgetForm } from './NewBudgetForm'

export const metadata = { title: 'New Budget' }

export default async function NewBudgetPage() {
  const crumbs = accountingCrumbs(['Budgets', '/accounting/budget'], ['New budget'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="New budget" what="the budget form" breadcrumbs={crumbs} width="narrow" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="New budget" tabs={false} />

  const [periods, funds] = await Promise.all([
    tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId)),
    tryLoad('funds', () => listFunds(ctx.associationId)),
  ])
  if (!periods.ok || !funds.ok) {
    return <AccountingLoadFailed title="New budget" what={!periods.ok ? 'fiscal periods' : 'funds'} breadcrumbs={crumbs} width="narrow" />
  }

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={crumbs}
      title="New budget"
      description="Pick the fund and fiscal period. You’ll add line items on the next screen."
    >
      <Card>
        <CardContent className="pt-5">
          <NewBudgetForm
            periods={periods.data.map((p) => ({ id: p.id, label: `${periodLabel(p)} · ${statusOf(PERIOD_STATUS, p.status).label}` }))}
            funds={funds.data.map((f) => ({ id: f.id, label: f.name }))}
            defaultPeriodId={ctx.currentPeriod?.id ?? periods.data[0]?.id ?? ''}
          />
        </CardContent>
      </Card>
    </Page>
  )
}
