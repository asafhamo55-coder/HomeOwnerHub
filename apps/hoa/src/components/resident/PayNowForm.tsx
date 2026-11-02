'use client'

// BL-035 PR 4/5: "Pay now" with Stripe's Payment Element (card, or bank
// account through Financial Connections). Card and bank numbers go straight
// from Stripe's fields to Stripe; this component only ever holds the client
// secret. Imports only pure modules and the server action.

import { useRef, useState } from 'react'
import { createOnlinePayment } from '@/lib/online-payments/actions'
import { usd as formatUsd } from '@/lib/money/format'
import type { FeePolicy } from '@/lib/online-payments/fees'
import { customAmountError, parseDollarsToCents, payOptionsFor, type PayMethod, type PayOption } from '@/lib/online-payments/pay-amount'

type Method = PayMethod
export type PayNowOption = PayOption

const usd = (cents: number) => formatUsd(cents / 100)

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
  options: fullOptions,
  policy,
  publishableKey,
}: {
  unitId: string
  /** Everything payable right now. */
  duesCents: number
  /** Prices for paying the full amount. */
  options: PayNowOption[]
  /** The fee rules, to price a different amount with the same pure engine. The server recomputes. */
  policy: FeePolicy
  publishableKey: string
}) {
  const [custom, setCustom] = useState(false)
  const [typed, setTyped] = useState('')
  const [method, setMethod] = useState<Method>(fullOptions[0]?.method ?? 'card')
  const [phase, setPhase] = useState<Phase>({ step: 'choose' })
  const [error, setError] = useState<string | null>(null)
  // One key per screen load and method: a double tap returns the same payment.
  const keys = useRef<Record<string, string>>({})
  const mount = useRef<HTMLDivElement | null>(null)
  const stripeRef = useRef<import('@stripe/stripe-js').Stripe | null>(null)
  const elementsRef = useRef<import('@stripe/stripe-js').StripeElements | null>(null)

  // "Pay a different amount": the box value, checked the way the server will check it.
  const customProblem = custom ? customAmountError(typed, duesCents) : null
  const customCents = custom && !customProblem ? parseDollarsToCents(typed) : null
  const payingCents = custom ? customCents : duesCents
  const options = custom && customCents ? payOptionsFor(customCents, policy) : fullOptions
  const chosen = options.find((o) => o.method === method) ?? options[0]
  if (!chosen) return null

  async function start() {
    setError(null)
    setPhase({ step: 'starting' })
    if (custom && customCents === null) {
      setError(customProblem ?? 'Type the amount in dollars and cents, like 125.00.')
      setPhase({ step: 'choose' })
      return
    }
    // One key per method AND amount: a changed amount must never reuse an old payment.
    const key = (keys.current[`${method}:${custom ? customCents : 'full'}`] ??= newKey())
    const res = await createOnlinePayment({ unitId, method, idempotencyKey: key, ...(custom && customCents ? { amountCents: customCents } : {}) })
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
              <span className="ml-8 text-base text-foreground-secondary">{feeLine(o, payingCents ?? duesCents)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div ref={mount} aria-label="Payment details" />
      )}

      {!entering ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setCustom((c) => !c)
              setError(null)
            }}
            className="min-h-12 text-lg font-medium text-primary underline underline-offset-4"
          >
            {custom ? `Pay the full ${usd(duesCents)}` : 'Pay a different amount'}
          </button>
          {custom ? (
            <div className="space-y-1">
              <label htmlFor="pay-amount" className="block text-lg font-medium">
                How much would you like to pay?
              </label>
              <input
                id="pay-amount"
                inputMode="decimal"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="125.00"
                aria-describedby="pay-amount-help"
                aria-invalid={typed !== '' && customProblem ? true : undefined}
                className="min-h-12 w-full rounded-lg border border-border bg-background px-4 text-lg"
              />
              <p id="pay-amount-help" className={`text-base ${typed !== '' && customProblem ? 'text-danger' : 'text-foreground-secondary'}`}>
                {typed !== '' && customProblem ? customProblem : `You can pay up to ${usd(duesCents)}. Whatever you do not pay stays on your account.`}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={phase.step === 'starting' || phase.step === 'paying' || (!entering && custom && customCents === null)}
        onClick={() => (entering ? confirm(phase.step === 'enter' ? phase.method : method) : start())}
        className="min-h-12 w-full rounded-lg bg-primary px-6 text-lg font-semibold text-primary-fg disabled:opacity-60"
      >
        {phase.step === 'starting' || phase.step === 'paying'
          ? 'One moment...'
          : `Pay ${usd(entering && phase.step === 'enter' ? phase.total : chosen.totalCents)}`}
      </button>
      <p className="text-base text-foreground-secondary">
        {feeLine(chosen, payingCents ?? duesCents)}
        {chosen.feePayer === 'homeowner' && chosen.feeCents > 0 ? ` = ${usd(chosen.totalCents)}` : ''}
      </p>
    </div>
  )
}
