'use client'

// BL-035 PR 4/5: "Pay now" with Stripe's Payment Element (card, or bank
// account through Financial Connections). Card and bank numbers go straight
// from Stripe's fields to Stripe; this component only ever holds the client
// secret. Imports only pure modules and the server action.

import { useRef, useState } from 'react'
import { createOnlinePayment } from '@/lib/online-payments/actions'

type Method = 'ach' | 'card'

export interface PayNowOption {
  method: Method
  feeCents: number
  /** 'homeowner' adds the fee to the charge. */
  feePayer: 'association' | 'homeowner'
  totalCents: number
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const LABEL: Record<Method, string> = { ach: 'Bank account', card: 'Card' }

function feeLine(o: PayNowOption, dues: number): string {
  if (o.feePayer === 'association' || o.feeCents === 0) return 'No fee for you.'
  return `${usd(dues)} dues + ${usd(o.feeCents)} fee`
}

function newKey(): string {
  const c = typeof crypto !== 'undefined' ? crypto : null
  if (c?.randomUUID) return c.randomUUID()
  return `k${Date.now()}${Math.random().toString(36).slice(2)}`.padEnd(16, '0')
}

type Phase =
  | { step: 'choose' }
  | { step: 'starting' }
  | { step: 'enter'; total: number; method: Method }
  | { step: 'paying' }
  | { step: 'done'; message: string }

export function PayNowForm({
  unitId,
  duesCents,
  options,
  publishableKey,
}: {
  unitId: string
  duesCents: number
  options: PayNowOption[]
  publishableKey: string
}) {
  const [method, setMethod] = useState<Method>(options[0]?.method ?? 'card')
  const [phase, setPhase] = useState<Phase>({ step: 'choose' })
  const [error, setError] = useState<string | null>(null)
  // One key per screen load and method: a double tap returns the same payment.
  const keys = useRef<Partial<Record<Method, string>>>({})
  const mount = useRef<HTMLDivElement | null>(null)
  const stripeRef = useRef<import('@stripe/stripe-js').Stripe | null>(null)
  const elementsRef = useRef<import('@stripe/stripe-js').StripeElements | null>(null)

  const chosen = options.find((o) => o.method === method) ?? options[0]
  if (!chosen) return null

  async function start() {
    setError(null)
    setPhase({ step: 'starting' })
    const key = (keys.current[method] ??= newKey())
    const res = await createOnlinePayment({ unitId, method, idempotencyKey: key })
    if (!res.ok) {
      setError(res.error)
      setPhase({ step: 'choose' })
      return
    }
    try {
      const { loadStripe } = await import('@stripe/stripe-js')
      const stripe = await loadStripe(publishableKey, { stripeAccount: res.stripeAccountId })
      if (!stripe) throw new Error('stripe')
      stripeRef.current = stripe
      const elements = stripe.elements({ clientSecret: res.clientSecret, appearance: { variables: { fontSizeBase: '18px' } } })
      elementsRef.current = elements
      setPhase({ step: 'enter', total: res.totalCents, method: res.method })
      // Mount after the container renders.
      requestAnimationFrame(() => {
        if (mount.current) elements.create('payment').mount(mount.current)
      })
    } catch {
      setError('We could not load the payment form. Nothing was taken. Try again.')
      setPhase({ step: 'choose' })
    }
  }

  async function confirm(m: Method) {
    const stripe = stripeRef.current
    const elements = elementsRef.current
    if (!stripe || !elements) return
    setError(null)
    setPhase({ step: 'paying' })
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/resident/dues` },
    })
    if (result.error) {
      setError(result.error.message ?? 'Your payment did not go through. Nothing was taken.')
      setPhase({ step: 'enter', total: chosen!.totalCents, method: m })
      return
    }
    const status = result.paymentIntent?.status
    setPhase({
      step: 'done',
      message:
        status === 'processing' || m === 'ach'
          ? 'Thank you. Your bank takes 3 to 5 business days. You do not need to do anything else.'
          : status === 'succeeded'
            ? 'Thank you. We received your payment.'
            : 'Your payment needs one more step. Check your dues page.',
    })
  }

  if (phase.step === 'done') {
    return (
      <p role="status" className="rounded-lg border border-border p-4 text-lg">
        {phase.message}
      </p>
    )
  }

  const entering = phase.step === 'enter' || phase.step === 'paying'
  return (
    <div className="space-y-4">
      {!entering ? (
        <fieldset className="space-y-3">
          <legend className="text-lg font-medium">How would you like to pay?</legend>
          {options.map((o) => (
            <label
              key={o.method}
              className={`flex min-h-12 cursor-pointer flex-col rounded-lg border p-4 ${o.method === method ? 'border-foreground' : 'border-border'}`}
            >
              <span className="flex items-center gap-3 text-lg font-medium">
                <input type="radio" name="pay-method" checked={o.method === method} onChange={() => setMethod(o.method)} className="size-5" />
                {LABEL[o.method]}
              </span>
              <span className="ml-8 text-base text-foreground-secondary">{feeLine(o, duesCents)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div ref={mount} aria-label="Payment details" />
      )}

      {error ? (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={phase.step === 'starting' || phase.step === 'paying'}
        onClick={() => (entering ? confirm(phase.step === 'enter' ? phase.method : method) : start())}
        className="min-h-12 w-full rounded-lg bg-primary px-6 text-lg font-semibold text-primary-foreground disabled:opacity-60"
      >
        {phase.step === 'starting' || phase.step === 'paying'
          ? 'One moment...'
          : `Pay ${usd(entering && phase.step === 'enter' ? phase.total : chosen.totalCents)}`}
      </button>
      <p className="text-base text-foreground-secondary">
        {feeLine(chosen, duesCents)}
        {chosen.feePayer === 'homeowner' && chosen.feeCents > 0 ? ` = ${usd(chosen.totalCents)}` : ''}
      </p>
    </div>
  )
}
