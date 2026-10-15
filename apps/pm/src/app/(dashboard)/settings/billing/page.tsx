import { Alert, Button, Card, CardContent, CardHeader, CardTitle, LoadFailed, NoOrgSelected, Page, StatusPill } from '@homeowner-portal/ui'
import { isStripeConfigured } from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { openPmPortal } from '@/lib/billing'
import { loadOrFail } from '@/lib/load-or-fail'
import { PlanPicker } from './PlanPicker'

export const metadata = { title: 'Billing' }

export default async function BillingPage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected noun="workspace" />

  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'your subscription',
    supabase.from('orgs').select('plan, stripe_customer_id, stripe_sub_id').eq('id', org.id).maybeSingle(),
  )
  if (!res.ok) {
    return (
      <Page width="default" title="Billing" back={{ href: '/settings', label: 'Settings' }}>
        <LoadFailed what="your subscription" hint="Plans are hidden until we know which one you're on." />
      </Page>
    )
  }
  const orgRow = res.data as { plan: string | null; stripe_customer_id: string | null } | null

  const plan = (orgRow?.plan as string | null) ?? 'free'
  // PM Hub "Investor" tier persists as 'starter' (schema constraint).
  // Show the user-facing label, not the raw slug.
  const planLabel = plan === 'starter' ? 'Investor' : plan.charAt(0).toUpperCase() + plan.slice(1)
  const stripeCustomerId = (orgRow?.stripe_customer_id as string | null) ?? null
  const stripeReady = isStripeConfigured()

  return (
    <Page
      width="default"
      back={{ href: '/settings', label: 'Settings' }}
      title="Billing"
      description="Free covers one property; paid plans unlock multi-property tracking."
    >
      <div className="space-y-8">
        <Card>
          <CardHeader
            actions={
              stripeCustomerId ? (
                <form action={openPmPortal}>
                  <Button type="submit" variant="secondary" size="sm">
                    Manage subscription
                  </Button>
                </form>
              ) : null
            }
          >
            <CardTitle as="h2" className="flex items-center gap-2">
              Current plan
              <StatusPill tone={plan === 'free' ? 'neutral' : 'success'} label={planLabel} />
            </CardTitle>
          </CardHeader>
          {stripeCustomerId ? null : (
            <CardContent className="text-sm text-muted">No subscription on file. Choose a plan below.</CardContent>
          )}
        </Card>

        {!stripeReady ? (
          <Alert variant="warning" title="Checkout isn’t configured">
            Set <code className="rounded bg-subtle px-1 font-mono text-xs">STRIPE_SECRET_KEY</code> and the price
            IDs in <code className="rounded bg-subtle px-1 font-mono text-xs">.env.local</code> to enable checkout.
          </Alert>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Plans</h2>
          <PlanPicker currentPlan={plan} />
        </section>
      </div>
    </Page>
  )
}
