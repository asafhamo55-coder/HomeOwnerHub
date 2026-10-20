'use client'

// BL-104: the Essentials / Complete picker, rendered only when PRICING_V2
// is on (page.tsx). Every amount is planPriceCents() — the same arithmetic
// as the Stripe tiers (packages/billing/src/pricing-v2.test.ts proves it).
// The door count shown is the homes on file, the quantity checkout sends.

import { useActionState, useState } from 'react'
import { Check } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, StatusPill, cn } from '@homeowner-portal/ui'
import {
  HOA_PLAN_IDS,
  MODULE_LABEL,
  PLAN_LABEL,
  PLAN_MODULES,
  TRIAL_DAYS,
  bandFor,
  bandLabel,
  formatUsd,
  isLegacyPlan,
  planAnnualSavingsUsd,
  planPriceUsd,
  type BillingCadence,
  type HoaPlanId,
} from '@homeowner-portal/billing'
import { startHoaCheckout, type BillingActionResult } from '@/lib/billing'

const initial: BillingActionResult = {}

const PLAN_PITCH: Record<HoaPlanId, string> = {
  essentials: 'Portal, communications, violations, ARC, meetings, documents and cited state-law answers, dues, and the AI assistant.',
  complete: 'Everything in Essentials plus full accounting, the shared mailbox, vendors and RFPs, leases, and higher AI limits.',
}

const cents = (usd: number) => formatUsd(usd, { withCents: true })

export function PlanPickerV2({
  currentPlan,
  homes,
  firstSubscription,
  initialCadence = 'annual',
}: {
  currentPlan: string
  /** Homes on file (hoa_properties count) — checkout's quantity. */
  homes: number
  /** No checkout has ever completed (no Stripe customer): the 30-day trial applies. */
  firstSubscription: boolean
  initialCadence?: BillingCadence
}) {
  const [state, action, pending] = useActionState(startHoaCheckout, initial)
  const [cadence, setCadence] = useState<BillingCadence>(initialCadence)
  const band = bandFor(homes)
  const legacy = isLegacyPlan(currentPlan)
  const noHomes = homes < 1

  return (
    <div className="space-y-4">
      {legacy ? (
        <Alert variant="info" title="Your current price stays until your term ends">
          You keep today’s per-door price until the end of your current term. Then your subscription moves to Complete at your size —{' '}
          {cents(planPriceUsd('complete', 'monthly', homes))} a month, lower than today. We’ll email you 30 days before. To move sooner,
          email support and we’ll switch you at your next invoice.
        </Alert>
      ) : null}
      {noHomes ? (
        <Alert variant="warning" title="Add your homes first">
          The price is set by how many homes you have. Add them under Properties, then come back to subscribe.
        </Alert>
      ) : null}

      <div role="radiogroup" aria-label="Billing cadence" className="inline-flex rounded-lg border border-border bg-subtle p-1 text-sm">
        {(['monthly', 'annual'] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cadence === c}
            onClick={() => setCadence(c)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                setCadence(cadence === 'monthly' ? 'annual' : 'monthly')
                // Roving tabindex: focus follows the checked radio, or it
                // is stranded on the one that just became tabIndex -1.
                const sibling = (e.currentTarget.nextElementSibling ?? e.currentTarget.previousElementSibling) as HTMLElement | null
                sibling?.focus()
              }
            }}
            tabIndex={cadence === c ? 0 : -1}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              cadence === c ? 'bg-surface text-foreground shadow-xs' : 'text-muted hover:text-foreground',
            )}
          >
            {c === 'monthly' ? 'Monthly' : 'Annual'}
            {c === 'annual' ? <Badge variant="success" size="sm">2 months free</Badge> : null}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        {homes} {homes === 1 ? 'home' : 'homes'} on file · {bandLabel(band)} band. Month to month; cancel any time.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {HOA_PLAN_IDS.map((plan) => {
          const price = planPriceUsd(plan, cadence, homes)
          const isCurrent = currentPlan === plan
          const cta = firstSubscription ? `Start ${TRIAL_DAYS}-day free trial` : `Subscribe · ${cents(price)}`
          return (
            <Card key={plan}>
              <CardContent className="space-y-4 p-6">
                <header className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">{PLAN_LABEL[plan]}</h3>
                    <p className="num text-3xl font-semibold tracking-tight text-foreground">
                      {cents(price)}
                      <span className="ml-1 text-sm font-normal text-muted">{cadence === 'annual' ? '/ year' : '/ month'}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {cadence === 'annual'
                        ? `Billed once a year — saves ${cents(planAnnualSavingsUsd(plan, homes))} vs paying monthly.`
                        : 'Billed every month.'}
                    </p>
                  </div>
                  {isCurrent ? <StatusPill tone="success" label="Current" size="sm" /> : null}
                </header>
                <p className="text-sm text-foreground-secondary">{PLAN_PITCH[plan]}</p>
                <ul className="grid gap-2 text-sm text-foreground-secondary">
                  {PLAN_MODULES[plan].map((m) => (
                    <li key={m} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      <span>{MODULE_LABEL[m]}</span>
                    </li>
                  ))}
                </ul>
                {firstSubscription ? (
                  <p className="text-xs text-muted">No card needed to start. After {TRIAL_DAYS} days, add a card to keep going.</p>
                ) : null}
                <form action={action}>
                  <input type="hidden" name="plan" value={plan} />
                  <input type="hidden" name="cadence" value={cadence} />
                  <Button type="submit" size="lg" className="w-full" loading={pending} disabled={isCurrent || legacy || noHomes}>
                    {isCurrent ? 'Current plan' : cta}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {state.error ? (
        <Alert variant="error" title="Couldn’t start checkout">
          {state.error}
        </Alert>
      ) : null}
    </div>
  )
}
