'use client'

import { useActionState } from 'react'
import { Check } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, cn } from '@homeowner-portal/ui'
import { startHoaCheckout, type BillingActionResult } from '@/lib/billing'

const initial: BillingActionResult = {}

interface Plan {
  id: 'starter' | 'standard' | 'pro'
  label: string
  price: string
  cadence: string
  bullets: string[]
  highlight?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    label: 'Starter',
    price: '$39',
    cadence: 'per month',
    bullets: [
      'Up to 50 properties',
      'AI Daily Digest',
      'Violation wizard with Covenant Brain',
      'CC&R parser',
    ],
  },
  {
    id: 'standard',
    label: 'Standard',
    price: '$79',
    cadence: 'per month',
    highlight: true,
    bullets: [
      'Up to 200 properties',
      'Everything in Starter',
      'Meeting Co-Pilot summaries',
      'Compliance Heat Map',
    ],
  },
  {
    id: 'pro',
    label: 'Pro',
    price: '$149',
    cadence: 'per month',
    bullets: [
      'Unlimited properties',
      'Everything in Standard',
      'Multi-board access controls',
      'Priority support',
    ],
  },
]

export function PlanPicker({ currentPlan }: { currentPlan: string }) {
  const [state, action, pending] = useActionState(startHoaCheckout, initial)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id
          return (
            <Card
              key={plan.id}
              variant={plan.highlight ? 'elevated' : 'default'}
              className={cn(
                'relative flex flex-col',
                plan.highlight && 'border-primary',
                isCurrent && 'ring-2 ring-primary ring-offset-2',
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-foreground">{plan.label}</p>
                    <p className="text-2xl font-bold text-foreground">
                      {plan.price}{' '}
                      <span className="text-xs font-normal text-muted">{plan.cadence}</span>
                    </p>
                  </div>
                  {isCurrent ? (
                    <Badge variant="success" size="sm">
                      Current
                    </Badge>
                  ) : plan.highlight ? (
                    <Badge variant="default" size="sm">
                      Popular
                    </Badge>
                  ) : null}
                </header>

                <ul className="flex-1 space-y-1.5 text-sm text-muted">
                  {plan.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <form action={action}>
                  <input type="hidden" name="plan" value={plan.id} />
                  <Button
                    type="submit"
                    variant={plan.highlight ? 'default' : 'outline'}
                    size="md"
                    className="w-full"
                    loading={pending}
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Current plan' : `Choose ${plan.label}`}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {state.error ? (
        <Alert variant="error" title="Couldn't start checkout">
          {state.error}
        </Alert>
      ) : null}
    </div>
  )
}
