'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { recheckStripePayouts } from '@/lib/online-payments/payout-recheck-action'
import { formatDay, usd } from '@/lib/money/format'

export interface MissingPayout {
  id: string
  amountCents: number
  arrivalDate: string
}

/** Stripe says it paid these out, but no matching deposit is in the bank feed (design 3.8 step 5). */
export function MissingPayouts({ payouts }: { payouts: MissingPayout[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  if (payouts.length === 0) return null

  function check() {
    startTransition(async () => {
      const r = await recheckStripePayouts()
      if (!r.ok) {
        toast({ tone: 'error', title: 'Couldn’t check', message: r.error })
        return
      }
      toast({
        tone: r.matched > 0 ? 'success' : 'info',
        title: r.matched > 0 ? 'Found a match' : 'No new match yet',
        message:
          r.matched > 0
            ? `${r.matched} ${r.matched === 1 ? 'payout was' : 'payouts were'} matched to a deposit.`
            : 'The deposit has not shown up in your bank feed yet.',
      })
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="missing-payouts" className="space-y-3 rounded-lg border border-warning/40 p-4" data-testid="missing-payouts">
      <h2 id="missing-payouts" className="text-lg font-semibold text-foreground">
        Stripe payout not found in your bank feed
      </h2>
      <p className="text-base text-foreground">
        Stripe says it sent {payouts.length === 1 ? 'this money' : 'these payments'} to your bank, but no matching deposit has shown up yet. Make sure your
        bank account is linked and up to date. Once the deposit appears, press Check again.
      </p>
      <ul className="space-y-1 text-base">
        {payouts.map((p) => (
          <li key={p.id}>
            <span className="font-medium">{usd(p.amountCents / 100)}</span> sent on {formatDay(p.arrivalDate)}
          </li>
        ))}
      </ul>
      <Button onClick={check} loading={pending} variant="secondary" icon={<RefreshCw aria-hidden />}>
        Check again
      </Button>
    </section>
  )
}
