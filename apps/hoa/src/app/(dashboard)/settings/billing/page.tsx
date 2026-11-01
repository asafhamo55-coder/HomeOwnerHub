import { Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, LoadFailed, NoOrgSelected, Page, StatusPill } from '@homeowner-portal/ui'
import {
  SOLD_PRICE_FAMILY,
  getStripe,
  isHoaPlanId,
  isLegacyPlan,
  isStripeConfigured,
  PLAN_LABEL,
  PRICING,
  PRICING_V2,
  priceFamilyForLookupKey,
  type PriceFamilyId,
} from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { openHoaPortal } from '@/lib/billing'
import { humanize } from '@/lib/money/status'
import { PlanPicker } from './PlanPicker'
import { PlanPickerV2 } from './PlanPickerV2'
import { PlanTotals, PlanTotalsV2, billingPriceCopy, billingPriceCopyV2 } from './price-display'
import { SmsAllowanceCard } from './SmsAllowanceCard'
import { BillingUnavailable, logBillingUnavailable } from './BillingUnavailable'
import { readSmsAllowance } from '@/lib/sms-allowance'
import { logRouteFailure } from '@/lib/api/log'

export const metadata = { title: 'Billing' }

/**
 * null when a subscribed org's Price cannot be read (Stripe down or the
 * subscription is not a band Price we know): the page then shows no amount
 * rather than one that might be wrong.
 */
async function resolvePriceFamily(orgId: string, plan: string, subId: string | null): Promise<PriceFamilyId | null> {
  if (!subId || !isHoaPlanId(plan)) return SOLD_PRICE_FAMILY
  try {
    const stripe = getStripe()
    if (!stripe) return null
    const sub = await stripe.subscriptions.retrieve(subId)
    return priceFamilyForLookupKey(sub.items.data[0]?.price?.lookup_key)
  } catch (err) {
    logRouteFailure('billing.price_family', err, { orgId })
    return null
  }
}

export default async function BillingPage() {
  const { role } = await requireBoardOrAdmin()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />
  const isAdmin = role === 'admin'
  // BL-104: the band pricing copy and picker, only after the cut-over.
  const v2 = PRICING_V2

  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'billing plan',
    supabase.from('orgs').select('plan, doors_count, stripe_customer_id, stripe_sub_id').eq('id', org.id).maybeSingle(),
  )
  // v2 prices by the homes on file — the quantity checkout sends.
  const homesRes = v2
    ? await supabase.from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', org.id)
    : null

  const description = v2 ? billingPriceCopyV2().description : billingPriceCopy().description

  // A failed read must not render as "Free plan, 0 doors" and invite an
  // admin to subscribe again.
  if (!res.ok || homesRes?.error) {
    return (
      <Page title="Billing" description={description}>
        <LoadFailed what="your billing details" />
      </Page>
    )
  }

  const orgRow = res.data as { plan: string | null; doors_count: number | null; stripe_customer_id: string | null } | null
  const plan = (orgRow?.plan as string | null) ?? 'free'
  const doors = (orgRow?.doors_count as number | null) ?? 0
  const homes = homesRes?.count ?? 0
  const stripeCustomerId = (orgRow?.stripe_customer_id as string | null) ?? null
  const stripeSubId = ((res.data as { stripe_sub_id?: string | null } | null)?.stripe_sub_id as string | null) ?? null
  const stripeReady = isStripeConfigured()
  if (!stripeReady) logBillingUnavailable(org.id, v2)
  const isFree = plan === 'free' || plan === ''
  const legacy = isLegacyPlan(plan)
  const planLabel = v2 && isHoaPlanId(plan) ? `${PLAN_LABEL[plan]} plan` : `${humanize(plan)} plan`
  // BL-104 §4: this month's texts against the plan's allowance — null (and
  // no read) before PRICING_V2 or for an org not on the new plans.
  // Advisory: a failed read hides the card rather than failing the page.
  // The Price family the subscription is on. orgs.plan cannot say which
  // Essentials-valued Price an org pays, so a subscribed org is read from
  // Stripe; no subscription means the Price it would be sold.
  const priceFamily = v2 ? await resolvePriceFamily(org.id, plan, stripeSubId) : SOLD_PRICE_FAMILY
  const smsAllowance = v2
    ? await readSmsAllowance(supabase, org.id).catch((err: unknown) => {
        logRouteFailure('billing.sms_allowance', err, { orgId: org.id })
        return null
      })
    : null

  return (
    <Page title="Billing" description={description}>
      {!stripeReady ? <BillingUnavailable /> : null}

      <Card>
        <CardHeader actions={<StatusPill tone={isFree ? 'neutral' : 'success'} label={isFree ? 'Free plan' : planLabel} />}>
          <CardTitle as="h2">Current plan</CardTitle>
          <CardDescription>
            {v2 ? 'What this association pays at the number of homes on file.' : 'What this association would pay at today’s door count.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {v2 ? <PlanTotalsV2 homes={homes} family={priceFamily} /> : <PlanTotals doors={doors} />}
          {isFree ? (
            v2 ? (
              <Alert variant="info" title="Try it free for 30 days">
                Start below with no card. Add a card before the trial ends to keep going.
              </Alert>
            ) : (
              <Alert variant="warning" title="The free plan is temporary">
                It’s offered to a small group of design-partner associations while we refine the platform, and will be retired after
                the partner phase. Subscribe below to lock in today’s pricing.
              </Alert>
            )
          ) : null}
        </CardContent>
        {isAdmin && stripeCustomerId ? (
          <CardFooter className="flex-wrap justify-between gap-3">
            <p className="text-sm text-muted">
              {v2 && !legacy
                ? 'Update the card, download invoices or cancel in Stripe. Cancel any time.'
                : `Update the card or download invoices in Stripe. Cancellation opens after the first ${PRICING.COMMIT_MONTHS} months.`}
            </p>
            <form action={openHoaPortal}>
              <Button type="submit" variant="secondary">
                Manage subscription
              </Button>
            </form>
          </CardFooter>
        ) : null}
      </Card>

      {smsAllowance ? <SmsAllowanceCard status={smsAllowance} /> : null}

      {isAdmin ? (
        <section aria-labelledby="choose-plan" className="space-y-3">
          <h2 id="choose-plan" className="text-lg font-semibold text-foreground">
            {isFree ? 'Choose a plan' : 'Your plan'}
          </h2>
          {v2 ? (
            <PlanPickerV2 currentPlan={plan} homes={homes} firstSubscription={!stripeCustomerId} />
          ) : (
            <PlanPicker currentPlan={plan} doors={doors} />
          )}
        </section>
      ) : (
        <p className="text-sm text-muted">Only admins can change the plan or payment method.</p>
      )}
    </Page>
  )
}
