import { Check } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { isStripeConfigured } from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { openEvictionPortal } from '@/lib/billing'
import { UnlimitedButton } from './UnlimitedButton'

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
  const isUnlimited = plan === 'unlimited'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">Billing</h1>
        <p className="text-sm text-muted-fg">
          Pay per case ($249), or upgrade to Unlimited ($99/month) for high volume.
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
            <form action={openEvictionPortal}>
              <Button type="submit" variant="outline">
                Manage subscription
              </Button>
            </form>
          ) : (
            <p className="text-muted-fg">
              No subscription on file. Choose a plan below or pay per case from a case&apos;s
              detail page.
            </p>
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per case</CardTitle>
            <CardDescription>$249 per filing — pay only when you use it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1.5 text-muted-fg">
              <PlanBullet>Pay $249 per case at the time of filing</PlanBullet>
              <PlanBullet>All compliance + AI features included</PlanBullet>
              <PlanBullet>No monthly commitment</PlanBullet>
            </ul>
            <p className="text-xs text-muted-fg">
              Per-case checkout opens from the case detail page once you&apos;ve drafted a
              notice.
            </p>
          </CardContent>
        </Card>

        <Card variant="elevated" className={isUnlimited ? 'ring-2 ring-primary ring-offset-2' : 'border-primary'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Unlimited
              {isUnlimited ? (
                <Badge variant="success" size="sm">
                  Current
                </Badge>
              ) : (
                <Badge variant="default" size="sm">
                  Best value
                </Badge>
              )}
            </CardTitle>
            <CardDescription>$99 / month — unlimited filings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1.5 text-muted-fg">
              <PlanBullet>Unlimited cases per month</PlanBullet>
              <PlanBullet>Same compliance + AI features</PlanBullet>
              <PlanBullet>Best fit for property managers and PM Hub power users</PlanBullet>
            </ul>
            <UnlimitedButton disabled={isUnlimited} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PlanBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  )
}
