'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, Field, Input, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { saveDuesRate } from '@/lib/dues-rates/actions'
import {
  FREQUENCY_LABELS,
  PERIODS_PER_YEAR,
  RATE_FREQUENCIES,
  centsLabel,
  changePct,
  dollarsToCents,
  isRateFrequency,
  pctPhrase,
  rateInEffect,
  rateLabel,
  type BudgetSuggestion,
  type DuesRate,
  type RateFrequency,
} from '@/lib/dues-rates/model'
import { addCalendarDays } from '@/lib/association-time'
import { formatDay } from '@/lib/money/format'

type Errors = Partial<Record<'effectiveFrom' | 'amount' | 'frequency' | 'notes' | 'budgetId', string>>

/** BL-137: add a rate to the schedule, with the change from the rate before it shown live. */
export function AddRateForm({
  rates,
  today,
  initial,
}: {
  rates: DuesRate[]
  /** The association's today, YYYY-MM-DD. */
  today: string
  /** From the budget adoption kit (`?budget=`), or null. */
  initial: (BudgetSuggestion & { budgetId: string }) | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Errors>({})
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? today)
  const [amount, setAmount] = useState(initial ? (initial.amountCents / 100).toFixed(2) : '')
  const [frequency, setFrequency] = useState<RateFrequency>(initial?.frequency ?? 'monthly')
  const [notes, setNotes] = useState(initial ? 'From the adopted budget' : '')

  const cents = dollarsToCents(amount)
  const valid = cents !== null && Number.isFinite(cents) && cents > 0
  const before = effectiveFrom ? rateInEffect(rates, addCalendarDays(effectiveFrom, -1)) : null
  const pct = valid && before ? changePct(before.amountCents * PERIODS_PER_YEAR[before.frequency], (cents as number) * PERIODS_PER_YEAR[frequency]) : null

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})
    startTransition(async () => {
      const res = await saveDuesRate({ effectiveFrom, amount, frequency, notes, budgetId: initial?.budgetId ?? null })
      if (!res.ok) {
        if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) setErrors(res.fieldErrors as Errors)
        else toast({ tone: 'error', title: 'Couldn’t save the rate', message: res.error })
        return
      }
      toast({ tone: 'success', message: 'Rate added to the schedule.' })
      router.replace('/dues/rates')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {initial ? <p className="text-sm text-foreground-secondary">{initial.explanation}</p> : null}
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Amount per home" required error={errors.amount}>
          <Input inputMode="decimal" prefix="$" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} disabled={pending} />
        </Field>
        <Field label="Billed" required error={errors.frequency}>
          <Select value={frequency} onValueChange={(v) => isRateFrequency(v) && setFrequency(v)} disabled={pending}>
            {RATE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f].adverb}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts" required error={errors.effectiveFrom}>
          <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.currentTarget.value)} disabled={pending} />
        </Field>
      </div>
      <Field label="Note" optional hint="Shown on the schedule, for example the meeting that adopted it." error={errors.notes}>
        <Textarea value={notes} onChange={(e) => setNotes(e.currentTarget.value)} maxLength={500} rows={2} disabled={pending} />
      </Field>
      <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm" aria-live="polite">
        {!valid ? (
          'Enter the amount to see the change.'
        ) : before ? (
          <>
            {centsLabel((cents as number) * PERIODS_PER_YEAR[frequency])} a year per home, against {rateLabel(before)} in effect before {formatDay(effectiveFrom)}:{' '}
            <strong className="num text-foreground">{pctPhrase(pct) ?? 'no earlier rate'}</strong>.
          </>
        ) : (
          <>
            {centsLabel((cents as number) * PERIODS_PER_YEAR[frequency])} a year per home. This is the first rate on the schedule.
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} icon={<Plus aria-hidden />}>
          Add rate
        </Button>
      </div>
    </form>
  )
}
