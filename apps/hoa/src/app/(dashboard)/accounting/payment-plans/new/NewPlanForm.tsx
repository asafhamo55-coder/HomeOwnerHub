'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import { createPaymentPlan } from '@/lib/payment-plans'

interface UnitOption {
  id: string
  label: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function NewPlanForm({ units }: { units: UnitOption[] }) {
  const router = useRouter()
  const [unitId, setUnitId] = useState(units[0]?.id ?? '')
  const [total, setTotal] = useState<number | ''>('')
  const [count, setCount] = useState(3)
  const [startDate, setStartDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const perInstallment =
    typeof total === 'number' && total > 0 && count > 0
      ? (total / count).toFixed(2)
      : '—'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (typeof total !== 'number' || total <= 0) {
      setError('total amount required')
      return
    }
    startTransition(async () => {
      const result = await createPaymentPlan({
        unitId,
        totalAmount: total,
        installmentCount: count,
        startDate,
      })
      if (!result.ok) {
        setError(result.error)
      } else {
        router.push('/accounting/payment-plans')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium text-foreground">Unit</span>
        <Select
          className="mt-1"
          value={unitId}
          onValueChange={(v) => setUnitId(v)}
          required
          disabled={pending}
        >
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </Select>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Total</span>
          <Input
            type="number"
            min={0}
            step={1}
            value={total}
            onChange={(e) => setTotal(e.target.value === '' ? '' : Number(e.target.value))}
            prefix={<span className="text-xs">$</span>}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Installments</span>
          <Input
            type="number"
            min={2}
            max={60}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 2)}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Start date</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
      </div>

      <p className="text-xs text-muted">
        Per installment: <span className="font-mono text-foreground">${perInstallment}</span>
      </p>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create plan
        </Button>
      </div>
    </form>
  )
}
