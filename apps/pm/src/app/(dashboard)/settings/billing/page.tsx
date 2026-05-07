import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@homeownerhub/ui'
import { isStripeConfigured } from '@homeownerhub/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { openPmPortal } from '@/lib/billing'
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
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">Billing</h1>
        <p className="text-sm text-muted-fg">
          PM Hub plans. Free covers one property; paid plans unlock multi-property tracking.
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
        <CardContent className="text-sm">
          {stripeCustomerId ? (
            <form action={openPmPortal}>
              <Button type="submit" variant="outline">
                Manage subscription
              </Button>
            </form>
          ) : (
            <p className="text-muted-fg">No subscription on file. Choose a plan below.</p>
          )}
        </CardContent>
      </Card>

      {!stripeReady ? (
        <Alert variant="warning" title="Stripe not configured">
          Set <code className="rounded bg-amber-100 px-1 font-mono text-xs">STRIPE_SECRET_KEY</code>{' '}
          and the price IDs in your <code className="rounded bg-amber-100 px-1 font-mono text-xs">.env.local</code>{' '}
          to enable checkout.
        </Alert>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-muted">Plans</h2>
        <PlanPicker currentPlan={plan} />
      </section>
    </div>
  )
}
