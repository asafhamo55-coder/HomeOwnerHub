'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { Button, ChoiceGroup, Field, Fieldset, Input, Radio, Select, useToast } from '@homeowner-portal/ui'
import { createDues } from '@/lib/assessments'
import { isBooksNotOpen } from '@/lib/accounting/books-not-open'
import { BooksNotOpenNotice } from '../../_components/BooksNotOpenNotice'
import { usd } from '@/lib/money/format'

interface UnitOption {
  id: string
  label: string
}

type Errors = Partial<Record<'scope' | 'unitId' | 'frequency' | 'assessmentType' | 'amount' | 'firstDueDate' | 'memo', string>>

const FREQUENCIES = [
  { value: 'one_time', label: 'Once', description: 'One charge per property.' },
  { value: 'monthly', label: 'Monthly', description: '12 charges, one a month for a year.' },
  { value: 'annual', label: 'Annually', description: 'One charge per property for the year.' },
] as const

export function NewDueForm({
  units,
  today,
}: {
  units: UnitOption[]
  /** The association's today, 'YYYY-MM-DD', from the server (BL-065). */
  today: string
}): React.ReactElement {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Errors>({})
  // BL-072: no open books → an inline notice that offers to open them.
  const [booksGap, setBooksGap] = useState<{ canOpenBooks: boolean } | null>(null)

  const [scope, setScope] = useState<'all' | 'unit'>('all')
  const [unitId, setUnitId] = useState('')
  const [frequency, setFrequency] = useState<'one_time' | 'monthly' | 'annual'>('one_time')
  const [assessmentType, setAssessmentType] = useState<'regular' | 'special'>('regular')
  const [amount, setAmount] = useState('')
  const [firstDueDate, setFirstDueDate] = useState(today)
  const [memo, setMemo] = useState('')

  const amt = Number(amount.replace(/[$,\s]/g, ''))
  const perProperty = frequency === 'monthly' ? 12 : 1
  const expectedRows = (scope === 'all' ? units.length : 1) * perProperty
  const expectedTotal = Number.isFinite(amt) && amt > 0 ? amt * expectedRows : null

  function submit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    const next: Errors = {}
    if (!Number.isFinite(amt) || amt <= 0) next.amount = 'Enter an amount greater than $0.'
    if (scope === 'unit' && !unitId) next.unitId = 'Pick the property to bill.'
    if (!firstDueDate) next.firstDueDate = 'Pick a due date.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBooksGap(null)

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
        if (isBooksNotOpen(res)) setBooksGap({ canOpenBooks: res.canOpenBooks })
        else if (res.fieldErrors && Object.keys(res.fieldErrors).some((k) => k !== '_')) setErrors(res.fieldErrors as Errors)
        else toast({ tone: 'error', title: 'Couldn’t add the due', message: res.error })
        return
      }
      const created = res.created ?? 0
      toast({ tone: 'success', message: `Created ${created} charge${created === 1 ? '' : 's'}.` })
      router.push('/dues')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Outside the form: the notice carries a form of its own. */}
      {booksGap ? <BooksNotOpenNotice canOpenBooks={booksGap.canOpenBooks} returnTo="/dues/new" /> : null}
      <form onSubmit={submit} noValidate className="space-y-6">
        <Fieldset legend="Who to bill" error={errors.scope}>
          <ChoiceGroup>
            <Radio name="scope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} label={`Every property (${units.length})`} />
            <Radio name="scope" value="unit" checked={scope === 'unit'} onChange={() => setScope('unit')} label="One property" />
          </ChoiceGroup>
        </Fieldset>

        {scope === 'unit' ? (
          <Field label="Property" required error={errors.unitId}>
            <Select value={unitId || undefined} onValueChange={setUnitId} placeholder="Choose a property" disabled={isPending}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Fieldset legend="How often" error={errors.frequency}>
          <ChoiceGroup>
            {FREQUENCIES.map((f) => (
              <Radio
                key={f.value}
                name="frequency"
                value={f.value}
                checked={frequency === f.value}
                onChange={() => setFrequency(f.value)}
                label={f.label}
                description={f.description}
              />
            ))}
          </ChoiceGroup>
        </Fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Amount per charge" required error={errors.amount}>
            <Input inputMode="decimal" prefix="$" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} disabled={isPending} />
          </Field>
          <Field label={frequency === 'monthly' ? 'First due date' : 'Due date'} required error={errors.firstDueDate}>
            <Input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.currentTarget.value)} disabled={isPending} />
          </Field>
          <Field label="Kind" error={errors.assessmentType}>
            <Select value={assessmentType} onValueChange={(v) => setAssessmentType(v as 'regular' | 'special')} disabled={isPending}>
              <option value="regular">Regular dues</option>
              <option value="special">Special assessment</option>
            </Select>
          </Field>
          <Field label="Memo" optional hint="Shown to owners on the charge." error={errors.memo}>
            <Input value={memo} onChange={(e) => setMemo(e.currentTarget.value)} placeholder="Q4 2026 dues" maxLength={140} disabled={isPending} />
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm" aria-live="polite">
          Creates <strong className="num text-foreground">{expectedRows}</strong> charge{expectedRows === 1 ? '' : 's'}
          {expectedTotal !== null ? (
            <>
              {' '}
              totalling <strong className="num text-foreground">{usd(expectedTotal)}</strong>
            </>
          ) : null}
          .{expectedRows > 100 ? ' This can take up to a minute.' : ''}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => router.push('/dues')} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} icon={<Wallet aria-hidden />}>
            Add {expectedRows === 1 ? 'due' : `${expectedRows} dues`}
          </Button>
        </div>
      </form>
    </div>
  )
}
