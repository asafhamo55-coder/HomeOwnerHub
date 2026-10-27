'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert, Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { applyCreditToCharge } from '@/lib/payments/apply-credit-actions'
import { parseDollarsToCents } from '@/lib/payments/lump-payment'
import { isBooksNotOpen } from '@/lib/accounting/books-not-open'
import { formatDay, usd } from '@/lib/money/format'

export interface ApplyCreditCharge {
  id: string
  label: string
  dueDate: string
  remainingCents: number
}

/**
 * BL-177 (M7_APPLIED): put some or all of the home's credit against one open
 * charge. The server re-checks everything; nothing is changed on a refusal.
 */
export function ApplyCreditButton({ credits, charges }: { credits: Array<{ id: string; remainingCents: number }>; charges: ApplyCreditCharge[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [chargeId, setChargeId] = useState(charges[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const totalCredit = credits.reduce((n, c) => n + c.remainingCents, 0)
  const charge = charges.find((c) => c.id === chargeId)
  if (charges.length === 0 || totalCredit <= 0) return null

  function save() {
    const cents = amount.trim() === '' ? Math.min(totalCredit, charge?.remainingCents ?? 0) : parseDollarsToCents(amount)
    if (!charge || cents === null || cents <= 0) {
      setError('Choose a charge and an amount in dollars and cents.')
      return
    }
    // One credit row at a time: the oldest with enough left, else the largest first.
    const sorted = [...credits].sort((a, b) => b.remainingCents - a.remainingCents)
    const target = sorted.find((c) => c.remainingCents >= cents)
    if (!target) {
      setError(`No single credit has ${usd(cents / 100)} left. Apply up to ${usd(sorted[0]!.remainingCents / 100)} at a time.`)
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await applyCreditToCharge({ creditId: target.id, assessmentId: charge.id, cents })
      if (isBooksNotOpen(r)) {
        setError(r.error)
        return
      }
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOpen(false)
      setAmount('')
      toast({ tone: 'success', message: `${usd(r.cents / 100)} of credit applied to the charge.` })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="xs" variant="secondary">
          Apply credit…
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Apply credit to a charge"
        description={`This home has ${usd(totalCredit / 100)} of credit on account.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending}>
              Apply credit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Charge">
            <Select value={chargeId} onValueChange={setChargeId} disabled={pending}>
              {charges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · due {formatDay(c.dueDate)} · {usd(c.remainingCents / 100)} left
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (blank = as much as fits)">
            <Input inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </Field>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
