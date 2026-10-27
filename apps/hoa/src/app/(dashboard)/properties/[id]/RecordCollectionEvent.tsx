'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Card, CardContent, Input, Select, Textarea, Field } from '@homeowner-portal/ui'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import { recordCollectionEvent } from '@/lib/collections/actions'
import { MAIL_METHODS, MAIL_METHOD_LABELS, isStatutoryMethod, type MailMethod } from '@/lib/collections/mail-tracking'
import { StateLawCheckPanel } from '@/components/compliance/StateLawCheckPanel'
import type { DriftCheck, DriftCode, OverrideReason } from '@/lib/compliance/statute-drift'
import {
  COLLECTION_EVENT_TYPES,
  collectionEventLabel,
  collectionStatusLabel,
  statusImpliedBy,
  type CollectionEventType,
  type CollectionStatus,
} from '@/lib/collections/statuses'

/** BL-166: the events a mailing can be recorded on (a notice went out, or a note about one). */
const MAIL_EVENT_TYPES: CollectionEventType[] = ['note', 'collection_letter_sent', 'lien_warning_sent', 'lien_letter_sent', 'demand_letter_sent']

/**
 * Append one action to the case trail.
 *
 * Entries are immutable once written (0047 grants INSERT but no UPDATE or
 * DELETE), so the form says so before you submit rather than after.
 */
export function RecordCollectionEvent({
  caseId,
  currentStatus,
  today,
}: {
  caseId: string
  currentStatus: CollectionStatus
  /** The association's today, 'YYYY-MM-DD', from the server (BL-065). */
  today: string
}) {
  const [open, setOpen] = useState(false)
  const [eventType, setEventType] = useState<CollectionEventType>('note')
  // BL-166: how it was mailed, once M7_APPLIED. '' = not recorded.
  const [mailMethod, setMailMethod] = useState<MailMethod | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // BL-149: the state law check the server ran on "Lien filed", and the board's override reasons.
  const [lawCheck, setLawCheck] = useState<DriftCheck | null>(null)
  const [lawOverrides, setLawOverrides] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<DriftCheck | null>(null)

  const implied = statusImpliedBy(eventType)
  // Only offer to move the stage when it would actually change something.
  const wouldAdvance = implied !== null && implied !== currentStatus
  const showMail = M7_APPLIED && MAIL_EVENT_TYPES.includes(eventType)

  if (!open) {
    return (
      <div className="space-y-3">
        {notice ? <StateLawCheckPanel check={notice} /> : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNotice(null)
            setOpen(true)
          }}
        >
          Record an action
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form
          className="space-y-3"
          action={(formData: FormData) => {
            setError(null)
            const rawAmount = String(formData.get('amount') ?? '').trim()
            startTransition(async () => {
              const result = await recordCollectionEvent({
                caseId,
                eventType,
                occurredOn: String(formData.get('occurredOn') ?? ''),
                note: String(formData.get('note') ?? '').trim() || undefined,
                // An empty box means "no amount", not zero — a $0 demand
                // letter is a different claim from one with no figure.
                amount: rawAmount === '' ? undefined : Number(rawAmount),
                actorInitials: String(formData.get('actorInitials') ?? '').trim() || undefined,
                advanceStatus: formData.get('advanceStatus') === 'on',
                ...(M7_APPLIED && showMail && mailMethod
                  ? {
                      mailMethod,
                      trackingNumber: String(formData.get('trackingNumber') ?? '').trim() || undefined,
                      mailedOn: String(formData.get('mailedOn') ?? '') || undefined,
                      deliveredOn: String(formData.get('deliveredOn') ?? '') || undefined,
                    }
                  : {}),
                ...(eventType === 'lien_filed' && Object.keys(lawOverrides).length > 0
                  ? { lawOverrides: lawOverrides as Record<DriftCode, OverrideReason> }
                  : {}),
              })
              if (!result.ok) {
                setError(result.error)
                setLawCheck(result.lawCheck ?? null)
              } else {
                setNotice(result.lawCheck ?? null)
                setLawCheck(null)
                setLawOverrides({})
                setOpen(false)
              }
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What happened">
              <Select
                name="eventType"
                value={eventType}
                onValueChange={(v) => setEventType(v as CollectionEventType)}
              >
                {COLLECTION_EVENT_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {collectionEventLabel(k)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date it happened">
              <Input
                type="date"
                name="occurredOn"
                required
                defaultValue={today}
                max={today}
              />
            </Field>
            <Field label="Amount (optional)">
              <Input type="number" name="amount" step="0.01" min="0" placeholder="5595.71" />
            </Field>
            <Field label="Initials (optional)">
              <Input name="actorInitials" maxLength={8} placeholder="ms" />
            </Field>
          </div>

          <Field label="Note (optional)">
            <Textarea name="note" rows={2} placeholder="D&amp;D sent dvl to owner" />
          </Field>

          {showMail ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">How and when it was mailed (optional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="How it was sent">
                  <Select name="mailMethod" value={mailMethod} onValueChange={(v) => setMailMethod(v as MailMethod | '')}>
                    <option value="">Not recorded</option>
                    {MAIL_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {MAIL_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {mailMethod ? (
                  <>
                    <Field label="Tracking number (optional)">
                      <Input name="trackingNumber" maxLength={100} />
                    </Field>
                    <Field label="Mailed on">
                      <Input type="date" name="mailedOn" max={today} />
                    </Field>
                    <Field label="Delivered on">
                      <Input type="date" name="deliveredOn" max={today} />
                    </Field>
                  </>
                ) : null}
              </div>
              {mailMethod && !isStatutoryMethod(mailMethod) ? (
                <p className="text-xs text-muted">Georgia’s waiting periods start only from certified mail or statutory overnight delivery.</p>
              ) : null}
            </div>
          ) : null}

          {wouldAdvance ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="advanceStatus" defaultChecked className="h-4 w-4" />
              <span>
                Also move this case to{' '}
                <strong className="font-medium">{collectionStatusLabel(implied)}</strong>
              </span>
            </label>
          ) : null}

          {lawCheck && eventType === 'lien_filed' ? (
            <StateLawCheckPanel
              check={lawCheck}
              overrides={lawOverrides}
              disabled={pending}
              onOverride={(code, reason) =>
                setLawOverrides((prev) => {
                  const next = { ...prev }
                  if (reason) next[code] = reason
                  else delete next[code]
                  return next
                })
              }
            />
          ) : null}

          {error ? <Alert variant="error">{error}</Alert> : null}

          <p className="text-xs text-muted">
            Entries cannot be edited or deleted once saved. Correct a mistake by adding a note.
          </p>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : 'Record'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
