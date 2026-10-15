'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Button, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { createPaymentPlan } from '@/lib/payment-plans'
import { todayIso, usd } from '@/lib/money/format'

interface UnitOption {
  id: string
  label: string
}

export function NewPlanForm({ units }: { units: UnitOption[] }) {
  const router = useRouter()
  const toast = useToast()
  const [unitId, setUnitId] = useState('')
  const [total, setTotal] = useState('')
  const [count, setCount] = useState('3')
  const [startDate, setStartDate] = useState(todayIso())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const totalNum = Number(total.replace(/[$,\s]/g, ''))
  const countNum = Number(count)
  const perInstallment = totalNum > 0 && Number.isInteger(countNum) && countNum >= 2 ? totalNum / countNum : null

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!unitId) next.unitId = 'Pick the property this plan is for.'
    if (!Number.isFinite(totalNum) || totalNum <= 0) next.totalAmount = 'Enter the balance to spread, greater than $0.'
    if (!Number.isInteger(countNum) || countNum < 2 || countNum > 60) next.installmentCount = 'Between 2 and 60 installments.'
    if (!startDate) next.startDate = 'Pick the first due date.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    startTransition(async () => {
      const result = await createPaymentPlan({ unitId, totalAmount: totalNum, installmentCount: countNum, startDate })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).some((k) => k !== '_')) setErrors(result.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t create the plan', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Plan created: ${countNum} monthly installments of ${usd(perInstallment)}.` })
      router.push('/accounting/payment-plans')
      router.refresh()
    })
  }

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
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Balance to spread" required error={errors.totalAmount}>
          <Input inputMode="decimal" prefix="$" placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Installments" required hint="2 to 60" error={errors.installmentCount}>
          <Input type="number" min={2} max={60} step={1} value={count} onChange={(e) => setCount(e.target.value)} disabled={pending} />
        </Field>
        <Field label="First due" required error={errors.startDate}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={pending} />
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm" aria-live="polite">
        {perInstallment !== null ? (
          <>
            <span className="text-muted">Each installment:</span>{' '}
            <span className="num font-semibold text-foreground">{usd(perInstallment)}</span>
            <span className="text-muted"> a month for {countNum} months.</span>
          </>
        ) : (
          <span className="text-muted">Enter a balance and installment count to see the monthly amount.</span>
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
