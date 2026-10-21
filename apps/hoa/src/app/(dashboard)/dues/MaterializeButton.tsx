'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, useToast } from '@homeowner-portal/ui'
import { materializeCurrentPeriodAssessments } from '@/lib/assessments'
import { isBooksNotOpen } from '@/lib/accounting/books-not-open'
import { BooksNotOpenNotice } from '../_components/BooksNotOpenNotice'

/** Generate this month's regular dues for every property, in a dialog. */
export function MaterializeButton({
  monthLabel,
  variant = 'secondary',
  prefill = null,
}: {
  monthLabel: string
  variant?: 'default' | 'secondary'
  /**
   * BL-137: the monthly amount from the dues rate in effect (M5_APPLIED),
   * and where it came from. Null → the old default. The board can change
   * it; the server records a different amount in the activity log.
   */
  prefill?: { cents: number; hint: string } | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(prefill ? (prefill.cents / 100).toFixed(2) : '250')
  const [error, setError] = useState<string | undefined>()
  // BL-072: no open books → say so in the dialog and offer to open them.
  const [booksGap, setBooksGap] = useState<{ canOpenBooks: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter the monthly dues per property, greater than $0.')
      return
    }
    setError(undefined)
    setBooksGap(null)
    startTransition(async () => {
      const result = await materializeCurrentPeriodAssessments({ amountPerUnit: n })
      if (!result.ok) {
        if (isBooksNotOpen(result)) setBooksGap({ canOpenBooks: result.canOpenBooks })
        else if (result.fieldErrors?.amountPerUnit) setError(result.fieldErrors.amountPerUnit)
        else toast({ tone: 'error', title: 'Couldn’t generate dues', message: result.error })
        return
      }
      setOpen(false)
      toast({ tone: 'success', message: `${monthLabel} dues generated.` })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={variant} icon={<CalendarPlus aria-hidden />}>
          Generate {monthLabel} dues
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Generate ${monthLabel} dues`}
        description="Creates one regular charge per property for this month and posts it to the ledger. Properties that already have regular dues in the current fiscal period are skipped."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="materialize-dues" loading={pending}>
              Generate dues
            </Button>
          </>
        }
      >
        <form id="materialize-dues" onSubmit={submit}>
          <Field label="Amount per property" required error={error} hint={prefill?.hint}>
            <Input inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </Field>
        </form>
        {booksGap ? (
          <div className="mt-4">
            <BooksNotOpenNotice canOpenBooks={booksGap.canOpenBooks} returnTo="/dues" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
