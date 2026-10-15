'use client'

import { useActionState, useState } from 'react'
import { Check, Sparkles, Lock } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, StatusPill, cn } from '@homeowner-portal/ui'
import {
  PRICING,
  billingSummary,
  formatUsd,
} from '@homeowner-portal/billing'
import {
  startHoaCheckout,
  type BillingActionResult,
} from '@/lib/billing'

const initial: BillingActionResult = {}

type Cadence = 'monthly' | 'annual'

const FEATURE_BULLETS = [
  'AI Daily Digest + Compliance Heat Map',
  'Violation wizard with Covenant Brain (CC&R citations)',
  'Meeting Co-Pilot summaries',
  'Resident portal — dues, ARC, governing docs',
  'Multi-board access controls + audit log',
  'Priority support',
]

export function PlanPicker({
  currentPlan,
  doors,
}: {
  currentPlan: string
  doors: number
}) {
  const [state, action, pending] = useActionState(startHoaCheckout, initial)
  const [cadence, setCadence] = useState<Cadence>('annual')

  const summary = billingSummary(doors)
  const activePrice =
    cadence === 'annual' ? summary.annualUsd : summary.monthlyUsd
  const billedAsText =
    cadence === 'annual'
      ? `Billed once a year — saves ${formatUsd(summary.annualSavingsUsd)} vs paying monthly.`
      : `Billed every month.`

  const isCurrent = currentPlan !== 'free' && currentPlan !== ''

  return (
    <div className="space-y-4">
      {/* Billing cadence: two mutually exclusive options, so radio
          semantics (arrow keys move between them). */}
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
              }
            }}
            tabIndex={cadence === c ? 0 : -1}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              cadence === c ? 'bg-surface text-foreground shadow-xs' : 'text-muted hover:text-foreground',
            )}
          >
            {c === 'monthly' ? 'Monthly' : 'Annual'}
            {c === 'annual' ? <Badge variant="success" size="sm">Save {PRICING.ANNUAL_DISCOUNT_PCT}%</Badge> : null}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <header className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Sparkles className="size-4 text-primary" aria-hidden />
                HOA Hub
              </p>
              <p className="num text-3xl font-semibold tracking-tight text-foreground">
                {formatUsd(activePrice)}
                <span className="ml-1 text-sm font-normal text-muted">{cadence === 'annual' ? '/ year' : '/ month'}</span>
              </p>
              <p className="text-sm text-muted">
                {formatUsd(PRICING.PER_DOOR_USD, { withCents: true })} per door · {summary.billableDoors}{' '}
                {summary.billableDoors === 1 ? 'door' : 'doors'}
                {summary.minApplied ? ` (minimum ${formatUsd(PRICING.MIN_MONTHLY_USD)}/month applied)` : ''}. {billedAsText}
              </p>
            </div>
            {isCurrent ? <StatusPill tone="success" label="Current" size="sm" /> : null}
          </header>

          <ul className="grid gap-2 text-sm text-foreground-secondary sm:grid-cols-2">
            {FEATURE_BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <Alert variant="info" title="First-year commitment">
            <span className="flex items-start gap-2">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                The first {PRICING.COMMIT_MONTHS} months can’t be cancelled. From month {PRICING.COMMIT_MONTHS + 1} you can cancel any time
                under <strong>Manage subscription</strong>.
              </span>
            </span>
          </Alert>

          <form action={action}>
            <input type="hidden" name="plan" value={cadence === 'annual' ? 'annual' : 'monthly'} />
            <input type="hidden" name="doors" value={String(summary.billableDoors)} />
            <Button type="submit" size="lg" className="w-full" loading={pending} disabled={isCurrent}>
              {isCurrent ? 'Current plan' : `Subscribe ${cadence === 'annual' ? 'annually' : 'monthly'} · ${formatUsd(activePrice)}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      {state.error ? (
        <Alert variant="error" title="Couldn’t start checkout">
          {state.error}
        </Alert>
      ) : null}
    </div>
  )
}
