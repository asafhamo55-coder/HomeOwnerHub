'use client'

import { useState, useTransition } from 'react'
import { Button, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { saveArcClockSettings } from '@/lib/arc-review/clock-actions'
import type { ArcDayKind } from '@/lib/arc-review/clock'

/**
 * BL-113: one association's "Decide ARC applications within N days".
 * Board-facing only; residents never see the deadline.
 */
export function ArcClockSettingsForm({
  associationId,
  associationName,
  initialDays,
  initialDayKind,
}: {
  associationId: string
  /** Shown when the org has more than one association. */
  associationName?: string
  initialDays: number
  initialDayKind: ArcDayKind
}) {
  const toast = useToast()
  const [days, setDays] = useState(String(initialDays))
  const [dayKind, setDayKind] = useState<ArcDayKind>(initialDayKind)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError('Enter a whole number of days from 1 to 365.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await saveArcClockSettings({ associationId, days: n, dayKind })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({ tone: 'success', message: `ARC applications are now due ${n} ${dayKind === 'business' ? 'business ' : ''}days after submission.` })
    })
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <Field
        label={associationName ? `Decide ARC applications within (${associationName})` : 'Decide ARC applications within'}
        error={error}
        className="w-40"
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          step={1}
          value={days}
          onChange={(e) => setDays(e.currentTarget.value)}
          disabled={pending}
        />
      </Field>
      <Field label="Count" className="w-44">
        <Select
          value={dayKind}
          onValueChange={(v) => setDayKind(v === 'business' ? 'business' : 'calendar')}
          disabled={pending}
          options={[
            { value: 'calendar', label: 'Every day' },
            { value: 'business', label: 'Business days' },
          ]}
        />
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save deadline'}
      </Button>
    </form>
  )
}
