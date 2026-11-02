'use client'

// The board gives an online payment back (BL-035 PR 6). Wired to the existing
// refundOnlinePayment action, which re-checks board/admin and the org. Wording
// is for volunteers, not accountants. Imports only pure modules and the action.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, useToast } from '@homeowner-portal/ui'
import { refundOnlinePayment } from '@/lib/online-payments/refund-action'
import { usd as formatUsd } from '@/lib/money/format'
import { parseDollarsToCents } from '@/lib/online-payments/pay-amount'

const usd = (cents: number) => formatUsd(cents / 100)

export function RefundOnlinePaymentButton({ paymentId, refundableCents }: { paymentId: string; refundableCents: number }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [part, setPart] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const partCents = part ? parseDollarsToCents(typed) : null
  const problem = part
    ? partCents === null
      ? 'Type the amount in dollars and cents, like 25.00.'
      : partCents > refundableCents
        ? `That is more than is left to give back (${usd(refundableCents)}).`
        : null
    : null

  function confirm() {
    if (part && (partCents === null || problem)) {
      setError(problem ?? 'Type the amount in dollars and cents, like 25.00.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await refundOnlinePayment({ paymentId, ...(part && partCents ? { cents: partCents } : {}) })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast({
        tone: 'success',
        title: 'Money is on its way back',
        message: `${usd(res.refundedCents)} is going back to the payer. It can take 5 to 10 business days to show on their statement.`,
      })
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Give money back
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4" role="group" aria-label="Give money back">
      <p className="text-base text-foreground">
        {part ? 'Part of this payment goes back to the person who paid.' : `All ${usd(refundableCents)} goes back to the person who paid.`} This home’s balance goes
        back up by the same amount. {part ? 'The service fee is not returned on a part refund.' : 'The service fee is returned too.'}
      </p>
      <button type="button" onClick={() => { setPart((p) => !p); setError(null) }} className="min-h-12 text-base font-medium text-primary underline underline-offset-4">
        {part ? `Give back all ${usd(refundableCents)}` : 'Give back only part'}
      </button>
      {part ? (
        <div className="space-y-1">
          <label htmlFor={`refund-${paymentId}`} className="block text-base font-medium">
            How much?
          </label>
          <input
            id={`refund-${paymentId}`}
            inputMode="decimal"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="25.00"
            className="min-h-12 w-40 rounded-lg border border-border bg-background px-4 text-lg"
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={confirm} loading={pending}>
          Yes, give it back
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
