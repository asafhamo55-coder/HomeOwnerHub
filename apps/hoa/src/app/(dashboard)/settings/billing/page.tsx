import { Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, LoadFailed, NoOrgSelected, Page, StatusPill } from '@homeowner-portal/ui'
import { isStripeConfigured, PRICING } from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { openHoaPortal } from '@/lib/billing'
import { humanize } from '@/lib/money/status'
import { PlanPicker } from './PlanPicker'
import { PlanTotals, billingPriceCopy } from './price-display'

export const metadata = { title: 'Billing' }

export default async function BillingPage() {
  const { role } = await requireBoardOrAdmin()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />
  const isAdmin = role === 'admin'

  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'billing plan',
    supabase.from('orgs').select('plan, doors_count, stripe_customer_id, stripe_sub_id').eq('id', org.id).maybeSingle(),
  )

  const description = billingPriceCopy().description

  // A failed read must not render as "Free plan, 0 doors" and invite an
  // admin to subscribe again.
  if (!res.ok) {
    return (
      <Page title="Billing" description={description}>
        <LoadFailed what="your billing details" />
      </Page>
    )
  }

  const orgRow = res.data as { plan: string | null; doors_count: number | null; stripe_customer_id: string | null } | null
  const plan = (orgRow?.plan as string | null) ?? 'free'
  const doors = (orgRow?.doors_count as number | null) ?? 0
  const stripeCustomerId = (orgRow?.stripe_customer_id as string | null) ?? null
  const stripeReady = isStripeConfigured()
  const isFree = plan === 'free' || plan === ''

  return (
    <Page title="Billing" description={description}>
      {!stripeReady ? (
        <Alert variant="warning" title="Stripe isn’t configured">
          Set <code className="rounded bg-subtle px-1 text-xs">STRIPE_SECRET_KEY</code> and the per-door price IDs (
          <code className="rounded bg-subtle px-1 text-xs">STRIPE_PRICE_PER_DOOR_MONTHLY</code>,{' '}
          <code className="rounded bg-subtle px-1 text-xs">STRIPE_PRICE_PER_DOOR_ANNUAL</code>) in the environment. Until then
          checkout will fail.
        </Alert>
      ) : null}

      <Card>
        <CardHeader actions={<StatusPill tone={isFree ? 'neutral' : 'success'} label={isFree ? 'Free plan' : `${humanize(plan)} plan`} />}>
          <CardTitle as="h2">Current plan</CardTitle>
          <CardDescription>What this association would pay at today’s door count.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlanTotals doors={doors} />
          {isFree ? (
            <Alert variant="warning" title="The free plan is temporary">
              It’s offered to a small group of design-partner associations while we refine the platform, and will be retired after
              the partner phase. Subscribe below to lock in today’s pricing.
            </Alert>
          ) : null}
        </CardContent>
        {isAdmin && stripeCustomerId ? (
          <CardFooter className="flex-wrap justify-between gap-3">
            <p className="text-sm text-muted">
              Update the card or download invoices in Stripe. Cancellation opens after the first {PRICING.COMMIT_MONTHS} months.
            </p>
            <form action={openHoaPortal}>
              <Button type="submit" variant="secondary">
                Manage subscription
              </Button>
            </form>
          </CardFooter>
        ) : null}
      </Card>

      {isAdmin ? (
        <section aria-labelledby="choose-plan" className="space-y-3">
          <h2 id="choose-plan" className="text-lg font-semibold text-foreground">
            {isFree ? 'Choose a plan' : 'Your plan'}
          </h2>
          <PlanPicker currentPlan={plan} doors={doors} />
        </section>
      ) : (
        <p className="text-sm text-muted">Only admins can change the plan or payment method.</p>
      )}
    </Page>
  )
}
