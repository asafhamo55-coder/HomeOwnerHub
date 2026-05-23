'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { Button, Input, Select } from '@homeowner-portal/ui'
import { createDues } from '@/lib/assessments'

interface UnitOption {
  id: string
  label: string
}

interface Props {
  units: UnitOption[]
}

export function NewDueForm({ units }: Props): React.ReactElement {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ created: number } | null>(null)

  const [scope, setScope] = useState<'all' | 'unit'>('all')
  const [unitId, setUnitId] = useState<string>('')
  const [frequency, setFrequency] = useState<'one_time' | 'monthly' | 'annual'>('one_time')
  const [assessmentType, setAssessmentType] = useState<'regular' | 'special'>('regular')
  const [amount, setAmount] = useState<string>('')
  const [firstDueDate, setFirstDueDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState<string>('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const amt = Number(amount.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number.')
      return
    }
    if (scope === 'unit' && !unitId) {
      setError('Pick a property.')
      return
    }

    startTransition(async () => {
      const res = await createDues({
        scope,
        unitId: scope === 'unit' ? unitId : undefined,
        frequency,
        assessmentType,
        amount: amt,
        firstDueDate,
        memo: memo.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess({ created: res.created ?? 0 })
      // brief pause so the success message is visible, then redirect
      setTimeout(() => router.push('/dues'), 1500)
    })
  }

  const expectedRows =
    scope === 'all'
      ? units.length * (frequency === 'monthly' ? 12 : 1)
      : (frequency === 'monthly' ? 12 : 1)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Scope
        </h2>

        <Field label="Bill which properties?" required>
          <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'unit')}>
            <option value="all">All properties ({units.length})</option>
            <option value="unit">Single property</option>
          </Select>
        </Field>

        {scope === 'unit' ? (
          <Field label="Property" required>
            <Select value={unitId} onValueChange={setUnitId}>
              <option value="">— pick a property —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </Select>
          </Field>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Frequency
        </h2>

        <Field label="Billing pattern" required>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as 'one_time' | 'monthly' | 'annual')}>
            <option value="one_time">One-time (1 charge per property)</option>
            <option value="monthly">Monthly (12 charges, 1 per month for a year)</option>
            <option value="annual">Annual (1 charge per property per year)</option>
          </Select>
        </Field>

        <Field label="Type">
          <Select value={assessmentType} onValueChange={(v) => setAssessmentType(v as 'regular' | 'special')}>
            <option value="regular">Regular (recurring dues)</option>
            <option value="special">Special assessment (one-off)</option>
          </Select>
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Amount &amp; date
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount per charge ($)" required>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              placeholder="200"
              required
            />
          </Field>

          <Field label={frequency === 'monthly' ? 'First due date' : 'Due date'} required>
            <Input
              type="date"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.currentTarget.value)}
              required
            />
          </Field>
        </div>

        <Field label="Memo (optional)">
          <Input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.currentTarget.value)}
            placeholder="Q3 2026 dues"
            maxLength={140}
          />
        </Field>
      </section>

      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted">
        Will create <strong className="text-foreground">{expectedRows}</strong> assessment{expectedRows === 1 ? '' : 's'}
        {expectedRows > 100 ? ' — this may take 30–60 seconds.' : '.'}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          Created {success.created} assessment{success.created === 1 ? '' : 's'}. Redirecting…
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push('/dues')}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Wallet className="h-4 w-4" />
          {isPending ? 'Creating…' : 'Add due'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}
