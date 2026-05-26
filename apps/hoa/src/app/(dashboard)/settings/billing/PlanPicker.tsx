'use client'

import { useActionState, useState } from 'react'
import { Check, Sparkles, Lock } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
} from '@homeowner-portal/ui'
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
      {/* Cadence toggle — monthly vs annual.
          Active state uses a light violet pill against the dark foreground
          text — readable both on light + dark backgrounds. Previous
          bg-primary + primary-foreground combo looked like a solid dark
          block with hard-to-read white text. */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
        <button
          type="button"
          onClick={() => setCadence('monthly')}
          aria-pressed={cadence === 'monthly'}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium transition',
            cadence === 'monthly'
              ? 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
              : 'text-muted hover:text-foreground',
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setCadence('annual')}
          aria-pressed={cadence === 'annual'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition',
            cadence === 'annual'
              ? 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
              : 'text-muted hover:text-foreground',
          )}
        >
          Annual
          <Badge variant="success" size="sm">
            Save {PRICING.ANNUAL_DISCOUNT_PCT}%
          </Badge>
        </button>
      </div>

      <Card variant="elevated" className="border-violet-200 dark:border-violet-900/40">
        <CardContent className="space-y-4 p-6">
          <header className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                HOA Hub
              </p>
              <p className="text-3xl font-bold text-foreground">
                {formatUsd(activePrice)}
                <span className="ml-1 text-sm font-normal text-muted">
                  {cadence === 'annual' ? '/year' : '/month'}
                </span>
              </p>
              <p className="text-xs text-muted">
                {formatUsd(PRICING.PER_DOOR_USD, { withCents: true })} per door · {summary.billableDoors} {summary.billableDoors === 1 ? 'door' : 'doors'}
                {summary.minApplied ? (
                  <span className="ml-1 text-foreground/80">
                    (minimum {formatUsd(PRICING.MIN_MONTHLY_USD)}/mo applied)
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">{billedAsText}</p>
            </div>
            {isCurrent ? (
              <Badge variant="success" size="sm">
                Current
              </Badge>
            ) : null}
          </header>

          <ul className="grid gap-1.5 text-sm text-muted sm:grid-cols-2">
            {FEATURE_BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <Alert variant="info" title="First-year commitment">
            <span className="flex items-start gap-2 text-sm">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              <span>
                Your first {PRICING.COMMIT_MONTHS} months are non-cancellable.
                You can cancel from month {PRICING.COMMIT_MONTHS + 1} onward via{' '}
                <strong>Manage subscription</strong>.
              </span>
            </span>
          </Alert>

          <form action={action}>
            <input type="hidden" name="plan" value={cadence === 'annual' ? 'annual' : 'monthly'} />
            <input type="hidden" name="doors" value={String(summary.billableDoors)} />
            <Button
              type="submit"
              variant="default"
              size="md"
              className="w-full bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
              loading={pending}
              disabled={isCurrent}
            >
              {isCurrent ? 'Current plan' : `Subscribe ${cadence === 'annual' ? 'annually' : 'monthly'}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      {state.error ? (
        <Alert variant="error" title="Couldn't start checkout">
          {state.error}
        </Alert>
      ) : null}
    </div>
  )
}
