'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTrigger } from '@homeowner-portal/ui'
import { recordPropertySale, type RecordSaleResult } from '@/lib/properties/sale-actions'
import { checkDraft, emptySaleDraft, type SaleDraft } from '@/lib/properties/sale-form'
import { RecordSaleForm } from './RecordSaleForm'
import { SaleRecorded } from './SaleRecorded'

/**
 * "Record a sale" (P3, PR-03): one guided step instead of overwriting the
 * owner fields. Board/admin only (the page renders it only for them; the
 * action gates again). After it's recorded the dialog turns into the
 * "invite the new owner" step — nothing is sent until the board clicks.
 */
export function RecordSaleDialog({
  propertyId,
  today,
  sellers,
  balance,
  tenantCount,
}: {
  propertyId: string
  today: string
  sellers: string[]
  balance: number | null
  tenantCount: number
}) {
  const router = useRouter()
  const formId = `record-sale-${useId().replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SaleDraft>(() => emptySaleDraft(today, tenantCount > 0))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ settlementDate: string; data: Extract<RecordSaleResult, { ok: true }>['data'] } | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setDraft(emptySaleDraft(today, tenantCount > 0))
    setFieldErrors({})
    setError(null)
    setDone(null)
  }

  function submit() {
    const checked = checkDraft(draft, today)
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors)
      setError('Fix the highlighted fields.')
      return
    }
    setFieldErrors({})
    setError(null)
    startTransition(async () => {
      const res = await recordPropertySale(propertyId, checked.raw)
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {})
        setError(res.error)
        return
      }
      setDone({ settlementDate: draft.settlementDate, data: res.data })
      router.refresh()
    })
  }

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
        <Button variant="secondary" icon={<ArrowRightLeft aria-hidden />}>
          Record a sale
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title={done ? 'Sale recorded' : 'Record a sale'}
        description={done ? undefined : 'Moves this home to its new owners in one step. The sellers’ history is kept.'}
        footer={
          done ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={formId} loading={pending}>
                Record sale
              </Button>
            </>
          )
        }
      >
        {done ? (
          <SaleRecorded propertyId={propertyId} settlementDate={done.settlementDate} done={done.data} />
        ) : (
          <RecordSaleForm
            formId={formId}
            draft={draft}
            onChange={setDraft}
            onSubmit={submit}
            today={today}
            sellers={sellers}
            balance={balance}
            tenantCount={tenantCount}
            fieldErrors={fieldErrors}
            error={error}
            pending={pending}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
