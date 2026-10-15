'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Alert, Button, Field, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { updateViolationStatus } from '@/lib/violations'
import { VIOLATION_STATUSES, type ViolationStatus } from '@/lib/violation-statuses'
import { VIOLATION_STATUS } from '@/lib/status/community'

const STATUS_HINT: Record<ViolationStatus, string> = {
  open: 'Reported but no notice has gone out yet.',
  notice_sent: 'Letter delivered; cure period is running.',
  fined: 'Cure period elapsed; daily fines are accruing.',
  resolved: 'Issue fixed by the homeowner. Closes the case.',
  dismissed: 'Withdrawn — not a violation after all. Closes the case.',
}

interface Props {
  violationId: string
  currentStatus: ViolationStatus
  currentResolutionNote: string | null
}

export function ViolationStatusEditor({ violationId, currentStatus, currentResolutionNote }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<ViolationStatus>(currentStatus)
  const [resolutionNote, setResolutionNote] = useState(currentResolutionNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const closingState = status === 'resolved' || status === 'dismissed'
  const dirty =
    status !== currentStatus ||
    (closingState && resolutionNote.trim() !== (currentResolutionNote ?? '').trim())

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await updateViolationStatus({
        violationId,
        status,
        resolutionNote: closingState ? resolutionNote.trim() || null : null,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        else setError(result.error)
        return
      }
      toast({ tone: 'success', message: `Status set to ${VIOLATION_STATUS.labels[status] ?? status}.` })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Status" hint={STATUS_HINT[status]} error={fieldErrors.status}>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ViolationStatus)}
          disabled={isPending}
        >
          {VIOLATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VIOLATION_STATUS.labels[s] ?? s}
            </option>
          ))}
        </Select>
      </Field>

      {closingState ? (
        <Field
          label={status === 'resolved' ? 'Resolution note' : 'Reason for dismissal'}
          optional
          error={fieldErrors.resolutionNote}
        >
          <Textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={
              status === 'resolved' ? 'How was it fixed? Verified by whom?' : 'Why is this being dismissed?'
            }
            disabled={isPending}
          />
        </Field>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button type="submit" className="w-full" loading={isPending} disabled={!dirty} icon={<Check aria-hidden />}>
        {isPending ? 'Saving…' : 'Update status'}
      </Button>
    </form>
  )
}
