'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createBudget } from '@/lib/budgets'

interface Option {
  id: string
  label: string
}

export function NewBudgetForm({
  periods,
  funds,
}: {
  periods: Option[]
  funds: Option[]
}) {
  const router = useRouter()
  const [fiscalPeriodId, setFiscalPeriodId] = useState(periods[0]?.id ?? '')
  const [fundId, setFundId] = useState(funds[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createBudget({ fiscalPeriodId, fundId })
      if (!result.ok) setError(result.error)
      else {
        router.push(`/accounting/budget/${result.budgetId}`)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium text-foreground">Fiscal period</span>
        <select
          value={fiscalPeriodId}
          onChange={(e) => setFiscalPeriodId(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          required
          disabled={pending}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Fund</span>
        <select
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          required
          disabled={pending}
        >
          {funds.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create budget
        </Button>
      </div>
    </form>
  )
}
