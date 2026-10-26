'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, ConfirmDialog, Field, Input, Select } from '@homeowner-portal/ui'
import { updateGaComplaint, type GaComplaintInput } from '@/lib/ga-complaints/actions'
import { GA_COMPLAINT_SUBJECTS, GA_COMPLAINT_SUBJECT_LABEL, type GaComplaint } from '@/lib/ga-complaints/model'

function useSave() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const save = (input: GaComplaintInput, done?: () => void) => {
    setError(null)
    startTransition(async () => {
      const res = await updateGaComplaint(input)
      if (!res.ok) setError(res.error)
      else {
        done?.()
        router.refresh()
      }
    })
  }
  return { error, pending, save }
}

/** BL-161: record a new Secretary of State complaint for this home. Board/admin only (the action re-checks). */
export function AddGaComplaint({ unitId, today }: { unitId: string; today: string }) {
  const [open, setOpen] = useState(false)
  const { error, pending, save } = useSave()
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Record a complaint filed
      </Button>
    )
  }
  return (
    <form
      className="space-y-3"
      action={(fd: FormData) =>
        save(
          { op: 'add', unitId, filedOn: String(fd.get('filedOn') ?? ''), subject: String(fd.get('subject') ?? '') as never },
          () => setOpen(false),
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Filed with the Secretary of State on">
          <Input type="date" name="filedOn" max={today} required />
        </Field>
        <Field label="About">
          <Select name="subject" defaultValue="both">
            {GA_COMPLAINT_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {GA_COMPLAINT_SUBJECT_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** BL-161: record (or clear) the hearing officer's conclusions, or remove an entry made by mistake. */
export function ConcludeGaComplaint({ unitId, complaint, today }: { unitId: string; complaint: GaComplaint; today: string }) {
  const [open, setOpen] = useState(false)
  const { error, pending, save } = useSave()
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {complaint.conclusionsOn ? 'Change' : 'Record the conclusions'}
      </Button>
    )
  }
  return (
    <form
      className="mt-2 space-y-3"
      action={(fd: FormData) => {
        const day = String(fd.get('conclusionsOn') ?? '').trim()
        save({ op: 'conclude', unitId, complaintId: complaint.id, conclusionsOn: day === '' ? null : day, extended: fd.get('extended') === 'on' }, () => setOpen(false))
      }}
    >
      <Field label="Hearing officer’s conclusions on (leave empty while the case is open)">
        <Input type="date" name="conclusionsOn" min={complaint.filedOn} max={today} defaultValue={complaint.conclusionsOn ?? ''} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="extended" defaultChecked={complaint.extended} />
        The hearing officer extended the stay 15 days
      </label>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <ConfirmDialog
          title="Remove this complaint from the record?"
          description="Do this only if it was recorded by mistake. If the hearing officer rendered conclusions, record them instead."
          confirmLabel="Remove"
          destructive
          onConfirm={() => save({ op: 'remove', unitId, complaintId: complaint.id })}
          trigger={
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              Remove (recorded by mistake)
            </Button>
          }
        />
      </div>
    </form>
  )
}
