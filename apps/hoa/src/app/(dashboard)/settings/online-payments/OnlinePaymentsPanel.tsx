'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Checkbox, Field, Input, Select, Switch, useToast } from '@homeowner-portal/ui'
import { refreshConnectStatus, saveOnlinePaymentSettings, startConnectOnboarding } from '@/lib/payments/connect-actions'
import { STATUS_COPY, type OnboardingStatus } from '@/lib/payments/connect-account'

export interface PanelInitial {
  enabled: boolean
  achFeePayer: 'association' | 'homeowner'
  cardFeePayer: 'association' | 'homeowner'
  cardAcknowledged: boolean
  returnedFeeDollars: string
  cardFeeAllowed: boolean
  canTurnOn: boolean
}

/** Status card plus the board's switch and fee choices. Plain words, large targets. */
export function OnlinePaymentsPanel({ status, initial }: { status: OnboardingStatus; initial: PanelInitial }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState(initial)
  const [ack, setAck] = useState(false)
  const copy = STATUS_COPY[status]

  function go() {
    setError(null)
    startTransition(async () => {
      const res = await startConnectOnboarding()
      if (!res.ok) return setError(res.error)
      if (res.url) window.location.assign(res.url)
    })
  }

  function check() {
    setError(null)
    startTransition(async () => {
      const res = await refreshConnectStatus()
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  function save() {
    setError(null)
    const dollars = v.returnedFeeDollars.trim()
    const cents = dollars === '' ? 0 : Math.round(Number(dollars) * 100)
    startTransition(async () => {
      const res = await saveOnlinePaymentSettings({
        onlinePaymentsEnabled: v.enabled,
        achFeePayer: v.achFeePayer,
        cardFeePayer: v.cardFeePayer,
        returnedPaymentFeeCents: Number.isFinite(cents) ? cents : -1,
        acknowledgeCardFee: ack,
      })
      if (!res.ok) return setError(res.error)
      toast({ tone: 'success', message: 'Saved.' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Not done">{error}</Alert> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <p className="text-base">{copy.body}</p>
        <div className="flex flex-wrap gap-3">
          {copy.action ? (
            <Button size="lg" onClick={go} disabled={pending}>
              {copy.action}
            </Button>
          ) : null}
          {status !== 'not_started' && status !== 'ready' ? (
            <Button size="lg" variant="secondary" onClick={check} disabled={pending}>
              Check again
            </Button>
          ) : null}
        </div>
      </section>

      {status !== 'not_started' ? (
        <section className="space-y-4">
          <Switch
            label="Let residents pay online"
            description={
              v.canTurnOn
                ? 'Residents see a Pay now button on their dues page.'
                : 'You can turn this on once Stripe finishes checking your account.'
            }
            checked={v.enabled}
            disabled={pending || (!v.canTurnOn && !v.enabled)}
            onChange={(e) => setV({ ...v, enabled: e.currentTarget.checked })}
          />
          <Field label="Who pays the bank transfer fee?">
            <Select value={v.achFeePayer} onValueChange={(x) => setV({ ...v, achFeePayer: x as 'association' | 'homeowner' })}>
              <option value="association">The association pays</option>
              <option value="homeowner">The resident pays</option>
            </Select>
          </Field>
          <Field label="Who pays the card fee?">
            <Select
              value={v.cardFeePayer}
              onValueChange={(x) => setV({ ...v, cardFeePayer: x as 'association' | 'homeowner' })}
            >
              <option value="association">The association pays</option>
              <option value="homeowner" disabled={!v.cardFeeAllowed}>
                The resident pays
              </option>
            </Select>
          </Field>
          {!v.cardFeeAllowed ? (
            <p className="text-sm">Charging residents the card fee is not available in your state yet.</p>
          ) : null}
          {v.cardFeePayer === 'homeowner' && v.cardFeeAllowed && !v.cardAcknowledged ? (
            <Checkbox
              label="I have read my state’s rules on passing card fees to residents."
              checked={ack}
              onChange={(e) => setAck(e.currentTarget.checked)}
            />
          ) : null}
          <Field label="Fee for a returned bank payment, in dollars (optional, at most 30)">
            <Input
              inputMode="decimal"
              value={v.returnedFeeDollars}
              onChange={(e) => setV({ ...v, returnedFeeDollars: e.currentTarget.value })}
            />
          </Field>
          <Button size="lg" onClick={save} disabled={pending}>
            Save
          </Button>
          <p className="text-sm">Changes apply to future payments only.</p>
        </section>
      ) : null}
    </div>
  )
}
