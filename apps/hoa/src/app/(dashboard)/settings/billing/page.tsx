import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { isStripeConfigured } from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { openHoaPortal } from '@/lib/billing'
import { PlanPicker } from './PlanPicker'

export const metadata = { title: 'Billing' }

export default async function BillingPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data: orgRow } = await supabase
    .from('orgs')
    .select('plan, stripe_customer_id, stripe_sub_id')
    .eq('id', org.id)
    .maybeSingle()

  const plan = (orgRow?.plan as string | null) ?? 'free'
  const stripeCustomerId = (orgRow?.stripe_customer_id as string | null) ?? null
  const stripeReady = isStripeConfigured()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted">
          Manage your HOA Hub subscription. Webhooks update your plan
          automatically after a successful checkout.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Current plan
            <Badge variant={plan === 'free' ? 'outline' : 'success'} size="sm">
              {plan}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {stripeCustomerId ? (
            <form action={openHoaPortal}>
              <Button type="submit" variant="outline">
                Manage subscription
              </Button>
              <p className="mt-2 text-xs text-muted">
                Opens the Stripe Customer Portal to update card, switch plan, or cancel.
              </p>
            </form>
          ) : (
            <p className="text-muted">
              No subscription on file. Pick a plan below to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {!stripeReady ? (
        <Alert variant="warning" title="Stripe not configured">
          Set <code className="rounded bg-amber-100 px-1 font-mono text-xs">STRIPE_SECRET_KEY</code>{' '}
          and the price IDs in <code className="rounded bg-amber-100 px-1 font-mono text-xs">apps/hoa/.env.local</code>{' '}
          to enable checkout. The plan cards below are visible but the buttons will fail until you do.
        </Alert>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Plans</h2>
        <PlanPicker currentPlan={plan} />
      </section>
    </div>
  )
}
