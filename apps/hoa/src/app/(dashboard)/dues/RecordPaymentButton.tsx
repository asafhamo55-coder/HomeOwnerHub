'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Landmark } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, useToast } from '@homeowner-portal/ui'
import { previewLumpPayment, recordLumpPayment } from '@/lib/payments/lump-payment-actions'
import { expectedOf, parseDollarsToCents, type LumpPreview } from '@/lib/payments/lump-payment'
import { isBooksNotOpen } from '@/lib/accounting/books-not-open'
import { ASK_YOUR_ATTORNEY } from '@/lib/collections/ga-payment-order'
import { BooksNotOpenNotice } from '../_components/BooksNotOpenNotice'
import { formatDay, usd } from '@/lib/money/format'

const dollars = (cents: number) => usd(cents / 100)

/**
 * BL-163: record one payment across a Georgia home's open charges. The
 * board types the amount, sees the split (statutory order from
 * 2027-01-01, oldest due first before) and only then saves. Nothing is
 * saved by previewing, and changing the amount clears the preview so the
 * board can never save a split it didn't see.
 */
export function RecordPaymentButton({ unitId, unitLabel }: { unitId: string; unitLabel: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [preview, setPreview] = useState<LumpPreview | null>(null)
  const [booksGap, setBooksGap] = useState<{ canOpenBooks: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const cents = parseDollarsToCents(amount)

  function reset() {
    setPreview(null)
    setError(undefined)
    setBooksGap(null)
  }

  function showSplit(e: React.FormEvent) {
    e.preventDefault()
    if (cents === null) {
      setError('Enter an amount in dollars and cents, more than $0.')
      return
    }
    reset()
    startTransition(async () => {
      const r = await previewLumpPayment({ unitId, amount: cents / 100 })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setPreview(r.preview)
    })
  }

  function save() {
    if (cents === null || !preview) return
    startTransition(async () => {
      const r = await recordLumpPayment({
        unitId,
        amount: cents / 100,
        paymentMethod: 'other',
        expected: expectedOf(preview),
      })
      if (isBooksNotOpen(r)) {
        setBooksGap({ canOpenBooks: r.canOpenBooks })
        return
      }
      if (!r.ok) {
        setPreview(null)
        setError(r.error)
        if ((r.recordedCents ?? 0) > 0) router.refresh()
        return
      }
      setOpen(false)
      setAmount('')
      reset()
      toast({
        tone: 'success',
        message: `${dollars(r.recordedCents)} recorded across ${r.chargeCount} ${r.chargeCount === 1 ? 'charge' : 'charges'} for ${unitLabel}.`,
      })
      router.refresh()
    })
  }

  const blocked = preview !== null && (preview.lines.length === 0 || preview.unappliedCents > 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="xs" variant="secondary" icon={<Landmark aria-hidden />}>
          Record payment…
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Record a payment for ${unitLabel}`}
        description="Enter what the owner paid. You’ll see how it is split across their open charges before anything is saved."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            {preview ? (
              <Button onClick={save} loading={pending} disabled={blocked}>
                Record {dollars(preview.appliedCents)}
              </Button>
            ) : (
              <Button type="submit" form={`record-payment-${unitId}`} loading={pending}>
                Show the split
              </Button>
            )}
          </>
        }
      >
        <form id={`record-payment-${unitId}`} onSubmit={showSplit} className="space-y-4">
          <Field label="Amount received" required error={error}>
            <Input
              inputMode="decimal"
              prefix="$"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setPreview(null)
                setError(undefined)
              }}
              disabled={pending}
            />
          </Field>
        </form>

        {preview ? <SplitTable preview={preview} /> : null}

        {booksGap ? (
          <div className="mt-4">
            <BooksNotOpenNotice canOpenBooks={booksGap.canOpenBooks} returnTo="/dues" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SplitTable({ preview }: { preview: LumpPreview }) {
  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      <p className="text-sm font-medium">
        {preview.mode === 'ga_statutory' ? 'Split in Georgia’s required order' : 'Split, oldest charge first'}
      </p>
      {preview.lines.length === 0 ? (
        <p className="text-sm text-muted">Nothing is due on this home right now, so there is nothing to apply this payment to.</p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border text-sm">
          {preview.lines.map((l) => (
            <li key={l.chargeId} className="flex items-start justify-between gap-3 p-3">
              <div>
                <div className="font-medium">
                  {l.label} <span className="font-normal text-muted">due {formatDay(l.dueDate)}</span>
                </div>
                {l.tierQuote ? (
                  <div className="text-xs text-muted">
                    ({l.tier}) {l.tierQuote}
                  </div>
                ) : null}
                {l.ambiguity ? <div className="text-xs font-medium">{ASK_YOUR_ATTORNEY}</div> : null}
              </div>
              <div className="text-right tabular-nums">
                <div className="font-medium">{dollars(l.appliedCents)}</div>
                <div className="text-xs text-muted">
                  {l.remainingAfterCents === 0 ? 'paid in full' : `${dollars(l.remainingAfterCents)} left`}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {preview.unappliedCents > 0 ? (
        <p className="rounded-lg border border-border p-3 text-sm">
          {dollars(preview.unappliedCents)} is more than is currently due ({dollars(preview.eligibleCents)}). It can’t be saved here:
          lower the amount to {dollars(preview.eligibleCents)}, then record the rest on a charge you choose with Mark paid.
        </p>
      ) : null}
      {preview.ambiguities.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted">
          {preview.ambiguities.map((a) => (
            <li key={a.code}>
              <span className="font-medium">{a.flag}.</span> {a.text}
            </li>
          ))}
        </ul>
      ) : null}
      {preview.citation ? (
        <p className="text-xs text-muted">
          {preview.citation.cite}: “{preview.citation.quote}” Charges not yet due are not paid by this split.
        </p>
      ) : null}
    </div>
  )
}
