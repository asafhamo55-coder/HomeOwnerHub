'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Button, Field, Select, useToast } from '@homeowner-portal/ui'
import { createBudget } from '@/lib/budgets'

interface Option {
  id: string
  label: string
}

export function NewBudgetForm({ periods, funds, defaultPeriodId }: { periods: Option[]; funds: Option[]; defaultPeriodId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [fiscalPeriodId, setFiscalPeriodId] = useState(defaultPeriodId)
  const [fundId, setFundId] = useState(funds[0]?.id ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!fiscalPeriodId) next.fiscalPeriodId = 'Pick a fiscal period.'
    if (!fundId) next.fundId = 'Pick a fund.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    startTransition(async () => {
      const result = await createBudget({ fiscalPeriodId, fundId })
      if (!result.ok) {
        if (result.fieldErrors && (result.fieldErrors.fiscalPeriodId || result.fieldErrors.fundId)) setErrors(result.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t create the budget', message: result.error })
        return
      }
      router.push(`/accounting/budget/${result.budgetId}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label="Fund" required error={errors.fundId}>
        <Select value={fundId || undefined} onValueChange={setFundId} disabled={pending} placeholder="Choose a fund">
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fiscal period" required error={errors.fiscalPeriodId}>
        <Select value={fiscalPeriodId || undefined} onValueChange={setFiscalPeriodId} disabled={pending} placeholder="Choose a period">
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push('/accounting/budget')} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} icon={<Plus aria-hidden />}>
          Create budget
        </Button>
      </div>
    </form>
  )
}
