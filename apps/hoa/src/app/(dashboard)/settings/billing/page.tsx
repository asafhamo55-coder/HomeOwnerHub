import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { isStripeConfigured, billingSummary, formatUsd, PRICING } from '@homeowner-portal/billing'
import { getCurrentOrg } from '@/lib/orgs'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { openHoaPortal } from '@/lib/billing'
import { PlanPicker } from './PlanPicker'

export const metadata = { title: 'Billing' }

export default async function BillingPage() {
  const { role } = await requireBoardOrAdmin()
  const org = await getCurrentOrg()
  if (!org) return null
  const isAdmin = role === 'admin'

  const supabase = await getSupabaseServerClient()
  const { data: orgRow } = await supabase
    .from('orgs')
    .select('plan, doors_count, stripe_customer_id, stripe_sub_id')
    .eq('id', org.id)
    .maybeSingle()

  const plan = (orgRow?.plan as string | null) ?? 'free'
  const doors = (orgRow?.doors_count as number | null) ?? 0
  const stripeCustomerId = (orgRow?.stripe_customer_id as string | null) ?? null
  const stripeReady = isStripeConfigured()
  const summary = billingSummary(doors)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted">
          {formatUsd(PRICING.PER_DOOR_USD, { withCents: true })} per door per month, {formatUsd(PRICING.MIN_MONTHLY_USD)}/mo minimum.{' '}
          Pay annually and save {PRICING.ANNUAL_DISCOUNT_PCT}%.
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Doors on file</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{doors}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted">If monthly</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {formatUsd(summary.monthlyUsd)}<span className="text-sm font-normal text-muted">/mo</span>
              </p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-950/30">
              <p className="text-xs uppercase tracking-wide text-muted">If annual (save 10%)</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {formatUsd(summary.annualUsd)}<span className="text-sm font-normal text-muted">/yr</span>
              </p>
              <p className="text-[11px] text-muted">
                save {formatUsd(summary.annualSavingsUsd)}/yr vs monthly
              </p>
            </div>
          </div>

          {summary.minApplied ? (
            <p className="text-xs text-muted">
              {summary.billableDoors} doors billed (per-door price × {doors} would fall below the {formatUsd(PRICING.MIN_MONTHLY_USD)}/mo minimum).
            </p>
          ) : null}

          {plan === 'free' ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Free plan note:</strong> the free tier is offered
              temporarily to a small set of design-partner HOAs while we
              refine the platform. It will be retired once we exit the
              partner phase — pick a paid plan below to lock in current
              pricing before that.
            </div>
          ) : null}

          {isAdmin && stripeCustomerId ? (
            <form action={openHoaPortal}>
              <Button type="submit" variant="outline">
                Manage subscription
              </Button>
              <p className="mt-2 text-xs text-muted">
                Opens the Stripe Customer Portal to update card or download invoices.{' '}
                Cancellation is available after your initial {PRICING.COMMIT_MONTHS}-month term.
              </p>
            </form>
          ) : isAdmin ? (
            <p className="text-muted">
              No subscription on file. Pick a billing cadence below to get started.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!stripeReady ? (
        <Alert variant="warning" title="Stripe not configured">
          Set <code className="rounded bg-amber-100 px-1 font-mono text-xs">STRIPE_SECRET_KEY</code>{' '}
          and <code className="rounded bg-amber-100 px-1 font-mono text-xs">STRIPE_PRICE_PER_DOOR_MONTHLY</code> /{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">STRIPE_PRICE_PER_DOOR_ANNUAL</code>{' '}
          in Vercel env vars to enable checkout. The plan card below is visible but the button will fail until you do.
        </Alert>
      ) : null}

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Plan</h2>
          <PlanPicker currentPlan={plan} doors={doors} />
        </section>
      )}
    </div>
  )
}
