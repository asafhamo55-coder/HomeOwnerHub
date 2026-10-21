'use client'

import { useState, useTransition } from 'react'
import { KeyRound, MapPin, Send } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { askToJoin } from '@/lib/owner-join/actions'
import type { ClaimInput } from '@/lib/owner-join/model'

// BL-143: ask by street address + ZIP (and unit, for a building), or by
// the code the board gave you. The answer for an address is the same
// whether or not it matched a home.

type Method = ClaimInput['method']

export function AskToJoinForm({ remaining }: { remaining: number | null }) {
  const [method, setMethod] = useState<Method>('address')
  const [fields, setFields] = useState({ address: '', postalCode: '', unit: '', code: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }))
    setFieldErrors((fe) => ({ ...fe, [k]: '' }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await askToJoin({ method, ...fields })
      if (r.ok) {
        setSent(r.message)
        setFields({ address: '', postalCode: '', unit: '', code: '' })
        return
      }
      setFieldErrors(r.fieldErrors ?? {})
      setError(r.fieldErrors ? null : r.error)
    })
  }

  if (sent) {
    return (
      <Alert variant="success" title="Request sent">
        {sent}
      </Alert>
    )
  }

  const outOfTries = remaining === 0

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex gap-2" role="radiogroup" aria-label="How do you want to ask?">
        <Button
          type="button"
          size="sm"
          role="radio"
          aria-checked={method === 'address'}
          variant={method === 'address' ? 'default' : 'secondary'}
          icon={<MapPin aria-hidden />}
          onClick={() => setMethod('address')}
        >
          My address
        </Button>
        <Button
          type="button"
          size="sm"
          role="radio"
          aria-checked={method === 'code'}
          variant={method === 'code' ? 'default' : 'secondary'}
          icon={<KeyRound aria-hidden />}
          onClick={() => setMethod('code')}
        >
          A code from my board
        </Button>
      </div>

      {method === 'address' ? (
        <>
          <Field label="Street address" required error={fieldErrors.address || undefined}>
            <Input value={fields.address} onChange={set('address')} autoComplete="address-line1" placeholder="12 Oak Street" disabled={pending} maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unit" optional hint="Only if your building has several homes." error={fieldErrors.unit || undefined}>
              <Input value={fields.unit} onChange={set('unit')} autoComplete="address-line2" placeholder="4B" disabled={pending} maxLength={40} />
            </Field>
            <Field label="ZIP code" required error={fieldErrors.postalCode || undefined}>
              <Input value={fields.postalCode} onChange={set('postalCode')} autoComplete="postal-code" inputMode="numeric" placeholder="30301" disabled={pending} maxLength={10} />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Join code" required hint="Ten letters and numbers, like ABCDE-FGHJK." error={fieldErrors.code || undefined}>
          <Input value={fields.code} onChange={set('code')} autoComplete="one-time-code" placeholder="ABCDE-FGHJK" disabled={pending} maxLength={20} />
        </Field>
      )}

      {error ? (
        <Alert variant="error" title="Couldn’t send it">
          {error}
        </Alert>
      ) : null}

      {remaining !== null ? (
        <p className="text-xs text-muted">
          {outOfTries ? 'You’ve used today’s requests. Try again tomorrow.' : `You can ask ${remaining} more time${remaining === 1 ? '' : 's'} today.`}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={outOfTries} iconRight={<Send aria-hidden />}>
        Send to my board
      </Button>
    </form>
  )
}
