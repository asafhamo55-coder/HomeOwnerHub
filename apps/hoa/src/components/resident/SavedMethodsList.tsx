'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Button } from '@homeowner-portal/ui'
import { makeDefaultMethod, removeMethod, startAddMethod } from '@/app/resident/dues/methods/actions'

export interface MethodView {
  id: string
  label: string
  expiry: string | null
  expired: boolean
  isDefault: boolean
}

export function SavedMethodsList({ methods, returnUrl }: { methods: MethodView[]; returnUrl: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const confirmRef = useRef<(() => Promise<void>) | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setMessage(res.error ?? 'Something went wrong. Try again.')
      else router.refresh()
    })
  }

  async function begin() {
    setMessage(null)
    const res = await startAddMethod()
    if (!res.ok) {
      setMessage(res.error)
      return
    }
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) {
      setMessage('Saved payment methods aren’t available yet.')
      return
    }
    const stripe = await loadStripe(key, { stripeAccount: res.stripeAccount })
    if (!stripe) {
      setMessage('Couldn’t load the secure form. Try again.')
      return
    }
    const elements = stripe.elements({ clientSecret: res.clientSecret })
    const el = elements.create('payment')
    confirmRef.current = async () => {
      const out = await stripe.confirmSetup({ elements, confirmParams: { return_url: returnUrl } })
      if (out.error) setMessage(out.error.message ?? 'That didn’t work. Check the details and try again.')
    }
    setAdding(true)
    // The mount node renders with `adding`; wait a frame for it.
    requestAnimationFrame(() => {
      if (mountRef.current) el.mount(mountRef.current)
    })
  }

  return (
    <div className="space-y-4">
      {methods.length === 0 ? (
        <p className="text-base text-foreground-secondary">You have no saved payment methods.</p>
      ) : (
        <ul className="space-y-3">
          {methods.map((m) => {
            const notes = [m.isDefault ? 'Used first' : null, m.expiry, m.expired ? 'This card has expired' : null].filter(Boolean)
            return (
              <li key={m.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-base font-semibold text-foreground">{m.label}</p>
                {notes.length > 0 ? <p className="text-sm text-muted">{notes.join('. ')}</p> : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  {m.isDefault || m.expired ? null : (
                    <Button type="button" variant="secondary" size="lg" disabled={pending} onClick={() => run(() => makeDefaultMethod({ id: m.id }))}>
                      Use this one first
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="lg"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.label}?`)) run(() => removeMethod({ id: m.id }))
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {adding ? (
        <div className="space-y-3">
          <div ref={mountRef} />
          <Button type="button" size="lg" onClick={() => void confirmRef.current?.()}>
            Save this method
          </Button>
        </div>
      ) : (
        <Button type="button" size="lg" disabled={pending} onClick={() => void begin()}>
          Add a bank account or card
        </Button>
      )}

      {message ? (
        <p role="alert" className="text-base text-danger">
          {message}
        </p>
      ) : null}
    </div>
  )
}
