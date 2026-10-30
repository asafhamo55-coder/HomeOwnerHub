'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardFooter,
  Field,
  Input,
  Select,
  Textarea,
} from '@homeowner-portal/ui'
import { scheduleMeeting, type MeetingType } from '@/lib/meetings'
import { updateBudgetAdoption } from '@/lib/budget-adoption/actions'
import type { AgendaActionItem } from '@/lib/meetings/agenda-template'
import { InsertAgendaButton } from '../InsertAgendaButton'

/** BL-138: scheduling the meeting that adopts this budget. */
export interface AdoptionBudgetRef {
  id: string
  name: string
  agenda: string
}

const TYPES: Array<{ value: MeetingType; label: string }> = [
  { value: 'regular', label: 'Regular board meeting' },
  { value: 'special', label: 'Special meeting' },
  { value: 'annual', label: 'Annual meeting' },
  { value: 'emergency', label: 'Emergency meeting' },
]

export interface AgendaFormContext {
  state: string | null
  associationType: string | null
  openActionItems: AgendaActionItem[]
}

export function ScheduleMeetingForm({
  budget = null,
  agendaContext = { state: null, associationType: null, openActionItems: [] },
}: { budget?: AdoptionBudgetRef | null; agendaContext?: AgendaFormContext } = {}) {
  const agendaRef = useRef<HTMLTextAreaElement>(null)
  const [type, setType] = useState<MeetingType>('regular')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setErrors({})
    setFormError(null)
    const meetingDate = String(formData.get('meeting_date') ?? '').trim()
    const meetingType = String(formData.get('meeting_type') ?? 'regular') as MeetingType
    const agenda = String(formData.get('agenda') ?? '').trim() || undefined

    if (!meetingDate) {
      setErrors({ meetingDate: 'Pick the date of the meeting.' })
      return
    }

    startTransition(async () => {
      const result = await scheduleMeeting({ meetingDate, meetingType, agenda })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
        else setFormError(result.error ?? 'Could not schedule the meeting.')
        return
      }
      if (budget && result.meetingId) {
        // Link it to the budget's adoption kit. If that fails the kit
        // offers the meeting in its picker, so the board can link it there.
        await updateBudgetAdoption(budget.id, { kind: 'meeting', meetingId: result.meetingId })
        router.push(`/accounting/budget/${budget.id}#adoption-kit`)
        return
      }
      router.push('/meetings')
    })
  }

  return (
    <Card>
      <form action={handleSubmit} noValidate>
        <CardContent className="space-y-4 pt-5">
          {formError ? (
            <Alert variant="error" title="Couldn’t schedule the meeting">
              {formError}
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" required error={errors.meetingDate}>
              <Input name="meeting_date" type="date" required autoFocus />
            </Field>
            <Field label="Type" error={errors.meetingType}>
              <Select name="meeting_type" value={type} onValueChange={(v) => setType(v as MeetingType)}>
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Agenda"
            optional
            hint="Topics to discuss and documents to review. Becomes the meeting’s notes until minutes are recorded."
            error={errors.agenda}
          >
            <Textarea ref={agendaRef} name="agenda" rows={6} maxLength={4000} defaultValue={budget?.agenda} placeholder="1. Approve last meeting’s minutes&#10;2. Q3 financials&#10;3. Pool resurfacing bids" />
          </Field>
          <div className="flex justify-end">
            <InsertAgendaButton fieldRef={agendaRef} meetingType={type} {...agendaContext} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} icon={<CalendarPlus aria-hidden />}>
            Schedule meeting
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
