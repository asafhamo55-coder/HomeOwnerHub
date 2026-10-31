'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, useToast } from '@homeowner-portal/ui'
import { materializeCurrentPeriodAssessments, previewMaterialize } from '@/lib/assessments'
import {
  NO_RATE_HINT,
  PREVIEW_FAILED,
  billedToast,
  emptyReason,
  initialAmount,
  previewLine,
  skippedLine,
  type PreviewFacts,
} from '@/lib/materialize-copy'
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
   * and where it came from. Null → the field starts blank. The board can change
   * it; the server records a different amount in the activity log.
   */
  prefill?: { cents: number; hint: string } | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(initialAmount(prefill))
  const [error, setError] = useState<string | undefined>()
  // BL-072: no open books → say so in the dialog and offer to open them.
  const [booksGap, setBooksGap] = useState<{ canOpenBooks: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  // Read-only preview of what a run would do, loaded each time the dialog opens.
  const [preview, setPreview] = useState<PreviewFacts | 'loading' | 'failed'>('loading')
  const [blindOk, setBlindOk] = useState(false)

  useEffect(() => {
    if (!open) return
    let live = true
    setPreview('loading')
    setBlindOk(false)
    previewMaterialize()
      .then((r) => {
        if (!live) return
        if (r.ok) setPreview(r)
        else if (isBooksNotOpen(r)) {
          setBooksGap({ canOpenBooks: r.canOpenBooks })
          setPreview('failed')
        } else setPreview('failed')
      })
      .catch(() => live && setPreview('failed'))
    return () => {
      live = false
    }
  }, [open])

  const facts = typeof preview === 'object' ? preview : null
  const empty = facts ? emptyReason(facts) : null
  const typed = Number(amount.replace(/[$,\s]/g, ''))
  const typedAmount = amount.trim() !== '' && Number.isFinite(typed) && typed > 0 ? typed : null
  const blocked = preview === 'loading' || empty !== null || (preview === 'failed' && !blindOk)

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
      toast({ tone: 'success', message: billedToast(result.created, monthLabel) })
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
            <Button type="submit" form="materialize-dues" loading={pending} disabled={blocked}>
              Generate dues
            </Button>
          </>
        }
      >
        <form id="materialize-dues" onSubmit={submit}>
          <Field
            label="Amount per property"
            required
            error={error}
            hint={
              prefill ? (
                prefill.hint
              ) : (
                <>
                  {NO_RATE_HINT}.{' '}
                  <Link href="/dues/rates" className="underline">
                    Dues rate settings
                  </Link>
                </>
              )
            }
          >
            <Input inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
          </Field>
          <div className="mt-4 text-sm" aria-live="polite">
            {preview === 'loading' ? <p className="text-muted">Checking which homes will be billed…</p> : null}
            {facts ? (
              <>
                <p className="font-medium">{previewLine(facts, typedAmount)}</p>
                {skippedLine(facts.alreadyBilled) ? <p className="mt-1 text-muted">{skippedLine(facts.alreadyBilled)}</p> : null}
                {empty ? <p className="mt-1 text-muted">{empty}</p> : null}
              </>
            ) : null}
            {preview === 'failed' && !booksGap ? (
              <div role="alert">
                <p className="font-medium">{PREVIEW_FAILED}</p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" checked={blindOk} onChange={(e) => setBlindOk(e.target.checked)} disabled={pending} />
                  <span>Generate anyway without a preview</span>
                </label>
              </div>
            ) : null}
          </div>
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
