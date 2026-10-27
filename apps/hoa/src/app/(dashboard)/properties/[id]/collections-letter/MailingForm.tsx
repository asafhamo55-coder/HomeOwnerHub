'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert, Button, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { recordLetterMailing } from '@/lib/collections/letters/actions'
import { MAIL_METHODS, MAIL_METHOD_LABELS, isStatutoryMethod, type MailMethod, type MailRecord } from '@/lib/collections/mail-tracking'

/**
 * BL-166 (shown only once M7_APPLIED): how and when a printed letter was
 * mailed and delivered. Entries are appended to the case (the trail is
 * immutable), so a delivery learned later is a second save that repeats the
 * method. The Georgia clocks count from the delivery day.
 */
export function MailingForm({
  propertyId,
  approvalRequestId,
  initial,
  today,
}: {
  propertyId: string
  approvalRequestId: string
  initial: MailRecord | null
  /** The association's today, 'YYYY-MM-DD', from the server. */
  today: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [method, setMethod] = useState<MailMethod>(initial?.method ?? 'certified')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mt-2 space-y-3 rounded-lg border border-border p-3 print:hidden"
      action={(formData: FormData) => {
        setError(null)
        startTransition(async () => {
          const r = await recordLetterMailing({
            propertyId,
            approvalRequestId,
            mailMethod: method,
            trackingNumber: String(formData.get('trackingNumber') ?? '').trim() || undefined,
            mailedOn: String(formData.get('mailedOn') ?? '') || undefined,
            deliveredOn: String(formData.get('deliveredOn') ?? '') || undefined,
          })
          if (!r.ok) {
            setError(r.error)
            return
          }
          toast({ tone: 'success', message: r.message })
          router.refresh()
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How it was sent">
          <Select name="mailMethod" value={method} onValueChange={(v) => setMethod(v as MailMethod)}>
            {MAIL_METHODS.map((m) => (
              <option key={m} value={m}>
                {MAIL_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tracking number (optional)">
          <Input name="trackingNumber" maxLength={100} defaultValue={initial?.trackingNumber ?? ''} />
        </Field>
        <Field label="Mailed on">
          <Input type="date" name="mailedOn" max={today} defaultValue={initial?.mailedOn ?? ''} />
        </Field>
        <Field label="Delivered on (the day the owner received it)">
          <Input type="date" name="deliveredOn" max={today} defaultValue={initial?.deliveredOn ?? ''} />
        </Field>
      </div>
      {!isStatutoryMethod(method) ? (
        <p className="text-xs text-muted">
          Georgia counts these waiting periods only from a notice sent by certified mail or statutory overnight delivery. This method is
          recorded, but it does not start the clock.
        </p>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <p className="text-xs text-muted">Saved entries cannot be edited. Add the delivery date later by saving again.</p>
      <Button type="submit" size="sm" loading={pending}>
        Save mailing record
      </Button>
    </form>
  )
}
