'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Alert, Button, Checkbox, ChoiceGroup, Field, Fieldset, Input, Select, useToast } from '@homeowner-portal/ui'
import { installmentSchedule } from '@homeowner-portal/workflows/payment-plans/schedule'
import { createPaymentPlan, listPlanCharges, type PlanChargeOption } from '@/lib/payment-plans'
import { formatDay, usd } from '@/lib/money/format'

interface UnitOption {
  id: string
  label: string
}

type ChargesState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  | { kind: 'loaded'; charges: PlanChargeOption[] }

/**
 * New payment plan (BL-080, double-count fix 2026-10-19). The board picks
 * the open charges the plan replaces; the past-due ones are preselected.
 * The plan total is what is still open on the picked charges: there is no
 * free-typed amount, so a plan can't add to what the owner owes.
 */
export function NewPlanForm({
  units,
  today,
}: {
  units: UnitOption[]
  /** The association's today, 'YYYY-MM-DD', from the server (BL-065). */
  today: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [unitId, setUnitId] = useState('')
  const [charges, setCharges] = useState<ChargesState>({ kind: 'idle' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [count, setCount] = useState('3')
  const [startDate, setStartDate] = useState(today)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!unitId) {
      setCharges({ kind: 'idle' })
      setPicked(new Set())
      return
    }
    let live = true
    setCharges({ kind: 'loading' })
    setPicked(new Set())
    listPlanCharges(unitId).then(
      (r) => {
        if (!live) return
        if (!r.ok) {
          setCharges({ kind: 'failed', error: r.error })
          return
        }
        setCharges({ kind: 'loaded', charges: r.charges })
        setPicked(new Set(r.charges.filter((c) => c.pastDue).map((c) => c.id)))
      },
      () => live && setCharges({ kind: 'failed', error: 'Couldn’t load the charges on this property. Try again.' }),
    )
    return () => {
      live = false
    }
  }, [unitId])

  const list = charges.kind === 'loaded' ? charges.charges : []
  const totalCents = list.filter((c) => picked.has(c.id)).reduce((t, c) => t + c.openCents, 0)
  const countNum = Number(count)
  const countOk = Number.isInteger(countNum) && countNum >= 2 && countNum <= 60
  const schedule = useMemo(
    () => (totalCents > 0 && countOk && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? installmentSchedule(startDate, countNum, totalCents) : []),
    [totalCents, countOk, countNum, startDate],
  )

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!unitId) next.unitId = 'Pick the property this plan is for.'
    else if (totalCents <= 0) next.chargeIds = 'Pick at least one open charge for the plan to replace.'
    if (!countOk) next.installmentCount = 'Between 2 and 60 installments.'
    if (!startDate) next.startDate = 'Pick the first due date.'
    if (schedule.some((s) => s.amountCents <= 0)) next.installmentCount = 'Too many installments for this balance.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    startTransition(async () => {
      const result = await createPaymentPlan({
        unitId,
        chargeIds: [...picked],
        expectedTotalCents: totalCents,
        installmentCount: countNum,
        startDate,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).some((k) => k !== '_')) setErrors(result.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t create the plan', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Plan created: ${countNum} monthly installments, ${usd(totalCents / 100)} in all.` })
      router.push('/accounting/payment-plans')
      router.refresh()
    })
  }

  const first = schedule[0]
  const last = schedule[schedule.length - 1]

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label="Property" required error={errors.unitId}>
        <Select value={unitId || undefined} onValueChange={setUnitId} disabled={pending} placeholder="Choose a property">
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </Select>
      </Field>

      {unitId ? (
        <Fieldset
          legend="Charges this plan replaces"
          hint="Past-due charges are picked for you. The plan closes the charges you pick and bills the same amount as installments."
          error={errors.chargeIds}
        >
          {charges.kind === 'loading' ? (
            <p className="text-sm text-muted">Loading the open charges…</p>
          ) : charges.kind === 'failed' ? (
            <Alert variant="error" title="Couldn’t load the charges">
              {charges.error}
            </Alert>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted">Nothing is open on this property, so there is no balance to spread.</p>
          ) : (
            <ChoiceGroup>
              {list.map((c) => (
                <Checkbox
                  key={c.id}
                  checked={picked.has(c.id)}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                  disabled={pending}
                  label={`${c.label}, due ${formatDay(c.dueDate)}`}
                  description={`${usd(c.openCents / 100)} open${c.pastDue ? ' · past due' : ''}`}
                />
              ))}
            </ChoiceGroup>
          )}
        </Fieldset>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Installments" required hint="2 to 60" error={errors.installmentCount}>
          <Input type="number" min={2} max={60} step={1} value={count} onChange={(e) => setCount(e.target.value)} disabled={pending} />
        </Field>
        <Field label="First due" required error={errors.startDate}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={pending} />
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm" aria-live="polite">
        {first && last ? (
          <>
            <span className="text-muted">Balance to spread:</span>{' '}
            <span className="num font-semibold text-foreground">{usd(totalCents / 100)}</span>
            <span className="text-muted">. Each installment:</span>{' '}
            <span className="num font-semibold text-foreground">{usd(first.amountCents / 100)}</span>
            <span className="text-muted">
              {' '}
              a month for {countNum} months, {formatDay(first.dueDate)} to {formatDay(last.dueDate)}
              {last.amountCents !== first.amountCents ? ` (the last is ${usd(last.amountCents / 100)})` : ''}.
            </span>
          </>
        ) : (
          <span className="text-muted">Pick a property and the charges to replace to see the monthly amount.</span>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push('/accounting/payment-plans')} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} icon={<Plus aria-hidden />}>
          Create plan
        </Button>
      </div>
    </form>
  )
}
