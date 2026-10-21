'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Checkbox, Input, Select, useToast } from '@homeowner-portal/ui'
import { updateBudgetAdoption, type AdoptionChange } from '@/lib/budget-adoption/actions'

/**
 * BL-138: the adoption kit's inputs. Each one saves through the board-only
 * updateBudgetAdoption action and refreshes the page. Nothing is sent.
 */

function useSave() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const save = (budgetId: string, change: AdoptionChange, done: string) =>
    start(async () => {
      const r = await updateBudgetAdoption(budgetId, change)
      if (!r.ok) {
        toast({ tone: 'error', title: 'Couldn’t save', message: r.error })
        return
      }
      toast({ tone: 'success', message: done })
      router.refresh()
    })
  return { pending, save }
}

export interface MeetingOption {
  id: string
  label: string
}

export function MeetingPicker({
  budgetId,
  current,
  options,
}: {
  budgetId: string
  current: string | null
  options: MeetingOption[]
}) {
  const { pending, save } = useSave()
  const [value, setValue] = useState(current ?? '')
  if (options.length === 0 && !current) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor={`adoption-meeting-${budgetId}`} className="sr-only">
          Adoption meeting
        </label>
        <Select
          id={`adoption-meeting-${budgetId}`}
          value={value}
          onValueChange={setValue}
          placeholder="Choose a scheduled meeting"
          disabled={pending}
          options={[{ value: '', label: 'No meeting linked' }, ...options.map((o) => ({ value: o.id, label: o.label }))]}
        />
      </div>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        disabled={value === (current ?? '')}
        onClick={() => save(budgetId, { kind: 'meeting', meetingId: value || null }, value ? 'Adoption meeting linked.' : 'Meeting unlinked.')}
      >
        Link meeting
      </Button>
    </div>
  )
}

export function SpecialAssessmentToggle({ budgetId, special }: { budgetId: string; special: boolean }) {
  const { pending, save } = useSave()
  return (
    <Checkbox
      label="Special assessments will be considered at this meeting"
      description="Florida then needs 14 days’ notice, mailed or delivered and posted on the property."
      checked={special}
      disabled={pending}
      onChange={(e) => save(budgetId, { kind: 'special', value: e.currentTarget.checked }, 'Saved.')}
    />
  )
}

export function DateRecorder({
  budgetId,
  kind,
  current,
  today,
  label,
  saveLabel,
  done,
}: {
  budgetId: string
  kind: 'adopted' | 'owner_notice'
  current: string | null
  today: string
  label: string
  saveLabel: string
  done: string
}) {
  const { pending, save } = useSave()
  const [value, setValue] = useState(current ?? today)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        aria-label={label}
        value={value}
        max={today}
        onChange={(e) => setValue(e.currentTarget.value)}
        disabled={pending}
        className="w-auto"
      />
      <Button size="sm" variant="secondary" loading={pending} disabled={!value} onClick={() => save(budgetId, { kind, on: value }, done)}>
        {saveLabel}
      </Button>
      {current ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(budgetId, { kind, on: null }, 'Cleared.')}>
          Clear
        </Button>
      ) : null}
    </div>
  )
}
