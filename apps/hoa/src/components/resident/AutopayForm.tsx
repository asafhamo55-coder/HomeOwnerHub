'use client'

import { useState, useTransition } from 'react'
import { Button } from '@homeowner-portal/ui'
import { enrollAutopay, changeAutopay, cancelAutopay } from '@/lib/online-payments/autopay-actions'
import {
  AUTOPAY_AGREE_LABEL,
  authorizationText,
  AUTOPAY_AUTHORIZATION_VERSION,
  dollars,
  parseMaxDollars,
} from '@/lib/online-payments/autopay'

// LEGAL REVIEW NEEDED (OA-48): the wording shown here comes from
// lib/online-payments/autopay.ts and has not been reviewed by counsel.

interface Props {
  unitId: string
  methods: Array<{ id: string; label: string }>
  suggestedMaxCents: number
  existing: { id: string; maxCents: number; includeOther: boolean; paused: boolean; methodLabel: string } | null
}

const input = 'h-12 w-full rounded-lg border border-border bg-background px-3 text-base'

export function AutopayForm({ unitId, methods, suggestedMaxCents, existing }: Props) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [maxText, setMaxText] = useState(String((existing?.maxCents ?? suggestedMaxCents) / 100))
  const [other, setOther] = useState(existing?.includeOther ?? false)
  const [agreed, setAgreed] = useState(false)
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '')

  const maxCents = parseMaxDollars(maxText)
  const methodLabel = existing?.methodLabel ?? methods.find((m) => m.id === methodId)?.label ?? 'saved payment method'

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMessage(null)
      const res = await fn()
      if (res.ok) setDone(true)
      else setMessage(res.error ?? 'Something went wrong.')
    })

  if (done) {
    return (
      <p role="status" className="text-base font-medium">
        Saved. Reload this page to see your autopay.
      </p>
    )
  }

  if (!existing && methods.length === 0) {
    return <p className="text-base">Save a bank account or card first. Then you can turn on autopay here.</p>
  }

  return (
    <div className="space-y-4 text-base">
      {existing?.paused ? (
        <p role="alert" className="font-medium">
          Autopay is paused because two payments did not go through. Check your payment method, then turn it back on.
        </p>
      ) : null}

      {!existing && methods.length > 1 ? (
        <label className="block space-y-1">
          <span className="font-medium">Pay from</span>
          <select className={input} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="font-medium">Never more than (dollars)</span>
        <input className={input} inputMode="decimal" value={maxText} onChange={(e) => setMaxText(e.target.value)} />
        {maxCents === null ? <span className="text-sm text-danger">Enter a number from 1 to 50,000.</span> : null}
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-6" checked={other} onChange={(e) => setOther(e.target.checked)} />
        <span>Also pay late fees and fines</span>
      </label>

      {!existing && maxCents !== null ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          {(authorizationText(AUTOPAY_AUTHORIZATION_VERSION, maxCents, methodLabel) ?? []).map((line) => (
            <p key={line}>{line}</p>
          ))}
          <label className="flex items-start gap-3 pt-2">
            <input type="checkbox" className="mt-1 size-6" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>{AUTOPAY_AGREE_LABEL}</span>
          </label>
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-danger">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {existing ? (
          <>
            <Button
              size="lg"
              disabled={pending || maxCents === null}
              onClick={() =>
                run(() =>
                  changeAutopay({ enrollmentId: existing.id, maxCents, includeOtherCharges: other, resume: existing.paused }),
                )
              }
            >
              {existing.paused ? `Turn autopay back on (limit ${maxCents ? dollars(maxCents) : ''})` : 'Save my limit'}
            </Button>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => cancelAutopay(existing.id))}>
              Turn off autopay
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            disabled={pending || maxCents === null || !agreed || !methodId}
            onClick={() =>
              run(() => enrollAutopay({ unitId, paymentMethodId: methodId, maxCents, includeOtherCharges: other, agreed: true }))
            }
          >
            Turn on autopay
          </Button>
        )}
      </div>
    </div>
  )
}
