import Link from 'next/link'
import { HandCoins, Plus } from 'lucide-react'
import { Alert, Button, DataTable, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { getAccountingContext, loadPaymentPlans } from '@/lib/accounting/queries'
import { loadPlanStandings } from '@/lib/accounting/plan-standings'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { tryLoad } from '@/lib/load-or-fail'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { behindCount, paymentPlanColumns, PRE_FIX_WARNING } from './columns'
import { loadReplacedChargeCounts, planKey } from '@homeowner-portal/workflows/payment-plans'

export const metadata = { title: 'Payment Plans' }
export const dynamic = 'force-dynamic'

export default async function PaymentPlansPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Payment plans" what="payment plans" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Payment plans" returnTo="/accounting/payment-plans" />

  const plansRes = await tryLoad('payment plans', () => loadPaymentPlans(ctx.associationId))
  // BL-080: how each plan is going, on the association's day. A failed
  // read leaves the list up and says "Couldn't load" in Progress.
  const standingsRes = plansRes.ok
    ? await tryLoad('payment plan progress', async () =>
        loadPlanStandings(await getSupabaseServerClient(), ctx, plansRes.data, todayIn(ctx.timeZone)),
      )
    : null
  const standings = standingsRes?.ok ? standingsRes.data : null
  const behind = behindCount(standings)
  // Plans made before the 2026-10-19 fix left the charges they spread open
  // (counted twice). They have no replaced-charge link; a failed read shows
  // no warning rather than a wrong one.
  const linksRes = plansRes.ok
    ? await tryLoad('replaced charges', async () => loadReplacedChargeCounts(await getSupabaseServerClient(), ctx.associationId))
    : null
  const preFix = new Set(
    linksRes?.ok && plansRes.ok ? plansRes.data.filter((p) => !linksRes.data.has(planKey(p.id))).map((p) => p.id) : [],
  )

  return (
    <Page
      title="Payment plans"
      description="Spread a balance an owner can’t pay at once into monthly installments. Each installment becomes its own charge on the owner’s account."
      tabs={<AccountingTabs />}
      actions={
        <Button asChild>
          <Link href="/accounting/payment-plans/new">
            <Plus aria-hidden />
            New plan
          </Link>
        </Button>
      }
    >
      {behind > 0 ? (
        <Alert variant="warning" title={behind === 1 ? '1 plan is behind' : `${behind} plans are behind`} className="mb-4">
          An installment is past its due date and not paid. Automatic dues reminders don’t go to a home on an active plan, so follow up with the owner yourself.
        </Alert>
      ) : null}
      {preFix.size > 0 ? (
        <Alert
          variant="warning"
          title={preFix.size === 1 ? '1 plan was created before 2026-10-19' : `${preFix.size} plans were created before 2026-10-19`}
          className="mb-4"
        >
          {PRE_FIX_WARNING} Until then a plan added its installments without closing the charges it spread, so the owner’s
          balance can show the same amount twice. The plans are marked in the Total column.
        </Alert>
      ) : null}
      {!plansRes.ok ? (
        <LoadFailed what="payment plans" />
      ) : (
        <DataTable
          caption="Payment plans"
          mobile="cards"
          columns={paymentPlanColumns(standings, preFix)}
          rows={plansRes.data}
          rowKey={(p) => p.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<HandCoins aria-hidden />}
              title="No payment plans"
              description="When an owner asks to pay a special assessment or a past-due balance over time, set the plan up here."
            />
          }
        />
      )}
    </Page>
  )
}
