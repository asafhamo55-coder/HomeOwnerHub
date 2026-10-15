import { Check } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LoadFailed,
  NoOrgSelected,
  Page,
  StatusPill,
  cn,
} from '@homeowner-portal/ui'
import { isStripeConfigured } from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { openEvictionPortal } from '@/lib/billing'
import { UnlimitedButton } from './UnlimitedButton'

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
  const stripeCustomerId = (orgRow?.stripe_customer_id as string | null) ?? null
  const stripeReady = isStripeConfigured()
  const isUnlimited = plan === 'unlimited'

  const planLabel = plan === 'per_case' ? 'Per case' : plan.charAt(0).toUpperCase() + plan.slice(1)

  return (
    <Page
      width="default"
      back={{ href: '/settings', label: 'Settings' }}
      title="Billing"
      description="Pay per case ($249), or go Unlimited ($99/month) for high volume."
    >
      <div className="space-y-8">
        <Card>
          <CardHeader
            actions={
              stripeCustomerId ? (
                <form action={openEvictionPortal}>
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
            <CardContent className="text-sm text-muted">
              No subscription on file. Choose Unlimited below, or pay per case from a case&apos;s page.
            </CardContent>
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
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-6">
                <div>
                  <p className="text-base font-semibold text-foreground">Per case</p>
                  <p className="num mt-1 text-3xl font-semibold tracking-tight text-foreground">
                    $249 <span className="text-sm font-normal text-muted">/ case</span>
                  </p>
                </div>
                <ul className="flex-1 space-y-2 border-t border-border pt-4 text-sm text-foreground-secondary">
                  <PlanBullet>Pay at the time of filing</PlanBullet>
                  <PlanBullet>All compliance and AI features included</PlanBullet>
                  <PlanBullet>No monthly commitment</PlanBullet>
                </ul>
                <p className="text-xs text-muted">Checkout opens from a case once you&apos;ve drafted its notice.</p>
              </CardContent>
            </Card>

            <Card className={cn('flex flex-col border-primary', isUnlimited && 'ring-2 ring-ring ring-offset-2 ring-offset-background')}>
              <CardContent className="flex flex-1 flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-foreground">Unlimited</p>
                    <p className="num mt-1 text-3xl font-semibold tracking-tight text-foreground">
                      $99 <span className="text-sm font-normal text-muted">/ month</span>
                    </p>
                  </div>
                  {isUnlimited ? <StatusPill tone="success" label="Current" /> : <StatusPill tone="brand" label="Best value" icon={null} />}
                </div>
                <ul className="flex-1 space-y-2 border-t border-border pt-4 text-sm text-foreground-secondary">
                  <PlanBullet>Unlimited cases per month</PlanBullet>
                  <PlanBullet>Same compliance and AI features</PlanBullet>
                  <PlanBullet>Best for property managers and PM Hub power users</PlanBullet>
                </ul>
                <UnlimitedButton disabled={isUnlimited} />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </Page>
  )
}

function PlanBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </li>
  )
}
