'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert, Button, Checkbox, ChoiceGroup, Field, Fieldset, Input, Radio, useToast } from '@homeowner-portal/ui'
import { mailApprovedLetter, previewMailedLetter, refreshMailedLetter, type PreviewResult } from '@/lib/mailed-letters/actions'
import { formatCents } from '@/lib/mailed-letters/cost'
import { describeMailedLetter, MAIL_SERVICE_LABELS, type MailedLetterView } from '@/lib/mailed-letters/status'
import type { MailService, PostalAddress } from '@/lib/mailed-letters/provider'
import { formatDay } from '@/lib/money/format'

/**
 * BL-032 (shown only once M14_APPLIED): mail an approved letter from the app.
 * Step 1 prices the exact letter. Step 2 asks "Mail this letter to [home]
 * for $X?", and nothing is sent until the board member ticks the box and
 * presses the button. The server recomputes the price and refuses a stale
 * one. Addresses go to the mailing service only.
 */

const EMPTY: PostalAddress = { name: '', line1: '', city: '', state: '', zip: '' }
const SERVICES: MailService[] = ['first_class', 'certified', 'certified_return_receipt']

export function MailLetterPanel({ propertyId, approvalRequestId }: { propertyId: string; approvalRequestId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [service, setService] = useState<MailService>('first_class')
  const [color, setColor] = useState(false)
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null)
  const [to, setTo] = useState<PostalAddress>(EMPTY)
  const [from, setFrom] = useState<PostalAddress>(EMPTY)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function price(nextService = service, nextColor = color, first = false) {
    setError(null)
    setConfirmed(false)
    startTransition(async () => {
      const r = await previewMailedLetter({ propertyId, approvalRequestId, service: nextService, color: nextColor })
      if (!r.ok) {
        setError(r.error)
        setPreview(null)
        return
      }
      if (first) {
        setTo({ ...EMPTY, ...r.recipient } as PostalAddress)
        if (r.certifiedRecommended) {
          setService('certified')
          price('certified', nextColor)
          return
        }
      }
      setPreview(r)
    })
  }

  function send() {
    if (!preview) return
    setError(null)
    startTransition(async () => {
      const r = await mailApprovedLetter({ propertyId, approvalRequestId, service, color, to, from, confirmedCents: preview.preview.totalCents, confirmed })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast({ tone: 'success', message: r.message })
      router.refresh()
    })
  }

  const set = (which: 'to' | 'from', key: keyof PostalAddress, value: string) =>
    (which === 'to' ? setTo : setFrom)((a) => ({ ...a, [key]: value }))

  const addressFields = (which: 'to' | 'from', a: PostalAddress) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <Input value={a.name} maxLength={80} onChange={(e) => set(which, 'name', e.target.value)} />
      </Field>
      <Field label="Street address">
        <Input value={a.line1} maxLength={100} onChange={(e) => set(which, 'line1', e.target.value)} />
      </Field>
      <Field label="Apartment or unit (optional)">
        <Input value={a.line2 ?? ''} maxLength={100} onChange={(e) => set(which, 'line2', e.target.value)} />
      </Field>
      <Field label="City">
        <Input value={a.city} maxLength={60} onChange={(e) => set(which, 'city', e.target.value)} />
      </Field>
      <Field label="State (two letters)">
        <Input value={a.state} maxLength={2} onChange={(e) => set(which, 'state', e.target.value)} />
      </Field>
      <Field label="ZIP code">
        <Input value={a.zip} maxLength={10} inputMode="numeric" onChange={(e) => set(which, 'zip', e.target.value)} />
      </Field>
    </div>
  )

  if (!preview) {
    return (
      <div className="space-y-3 print:hidden">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button type="button" variant="secondary" onClick={() => price(service, color, true)} loading={pending}>
          Mail this letter for me
        </Button>
        <p className="text-sm text-foreground-secondary">We print it, put it in an envelope and mail it. You see the price before anything is sent.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 print:hidden">
      <Fieldset legend="How should it go?">
        <ChoiceGroup>
          {SERVICES.map((s) => (
            <Radio
              key={s}
              name="mail-service"
              value={s}
              checked={service === s}
              onChange={() => {
                setService(s)
                price(s, color)
              }}
              label={MAIL_SERVICE_LABELS[s]}
              description={s === 'first_class' ? undefined : 'Gets a tracking number.'}
            />
          ))}
        </ChoiceGroup>
      </Fieldset>
      {preview.certifiedRecommended && service === 'first_class' ? (
        <Alert variant="warning">
          Georgia counts this notice’s waiting period only from a notice sent by certified mail or statutory overnight delivery. First class does not start the clock.
        </Alert>
      ) : null}
      <Checkbox checked={color} onChange={(e) => (setColor(e.target.checked), price(service, e.target.checked))} label="Print in color" />

      <div className="space-y-1 text-sm">
        {preview.preview.lines.map((l) => (
          <div key={l.label} className="num flex justify-between gap-3">
            <span>{l.label}</span>
            <span>{formatCents(l.cents)}</span>
          </div>
        ))}
        <div className="num flex justify-between gap-3 border-t border-border pt-1 font-semibold">
          <span>
            Total ({preview.pages} page{preview.pages === 1 ? '' : 's'})
          </span>
          <span>{preview.preview.totalLabel}</span>
        </div>
      </div>

      <Fieldset legend="Send it to">{addressFields('to', to)}</Fieldset>
      <Fieldset legend="Return address (the association’s mailing address)">{addressFields('from', from)}</Fieldset>

      <p className="text-base font-medium">
        Mail this letter to {preview.home || 'this home'} for {preview.preview.totalLabel}? {MAIL_SERVICE_LABELS[service]}.
      </p>
      <Checkbox
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
        label={`Yes, mail it and charge ${preview.preview.totalLabel}`}
        description="I checked the figures, the letter and both addresses."
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={send} disabled={!confirmed || pending} loading={pending}>
          Mail it for {preview.preview.totalLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setPreview(null)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** The status of a letter already mailed from the app, with a check-now button. */
export function MailedStatus({ propertyId, approvalRequestId, mailed }: { propertyId: string; approvalRequestId: string; mailed: MailedLetterView }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const done = mailed.status === 'delivered' || mailed.status === 'returned' || mailed.status === 'failed'
  return (
    <div className="text-sm print:hidden">
      {describeMailedLetter(mailed, formatDay).map((line) => (
        <p key={line} className="text-foreground-secondary">
          {line}
        </p>
      ))}
      <p className="num text-foreground-secondary">Charged {formatCents(mailed.confirmedCents)}.</p>
      {!done ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await refreshMailedLetter({ propertyId, approvalRequestId })
              toast(r.ok ? { tone: 'success', message: r.message } : { tone: 'error', title: 'Not updated', message: r.error })
              router.refresh()
            })
          }
        >
          Check where it is
        </Button>
      ) : null}
    </div>
  )
}
