'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Alert, Button, Select, Textarea } from '@homeowner-portal/ui'
import { updateViolationStatus } from '@/lib/violations'
import {
  VIOLATION_STATUSES,
  type ViolationStatus,
} from '@/lib/violation-statuses'

const STATUS_LABEL: Record<ViolationStatus, string> = {
  open: 'Open',
  notice_sent: 'Notice sent',
  fined: 'Fined',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

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

export function ViolationStatusEditor({
  violationId,
  currentStatus,
  currentResolutionNote,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<ViolationStatus>(currentStatus)
  const [resolutionNote, setResolutionNote] = useState(currentResolutionNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const closingState = status === 'resolved' || status === 'dismissed'
  const dirty =
    status !== currentStatus ||
    (closingState && resolutionNote.trim() !== (currentResolutionNote ?? '').trim())

  function submit() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await updateViolationStatus({
        violationId,
        status,
        resolutionNote: closingState ? resolutionNote.trim() || null : null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="violation-status" className="text-xs font-medium uppercase tracking-wide text-muted">
          Status
        </label>
        <Select
          id="violation-status"
          value={status}
          onValueChange={(v) => {
            setStatus(v as ViolationStatus)
            setSuccess(false)
          }}
          disabled={isPending}
        >
          {VIOLATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted">{STATUS_HINT[status]}</p>
      </div>

      {closingState ? (
        <div className="space-y-1">
          <label
            htmlFor="resolution-note"
            className="text-xs font-medium uppercase tracking-wide text-muted"
          >
            {status === 'resolved' ? 'Resolution note' : 'Reason for dismissal'}
            <span className="ml-1 normal-case text-muted/70">(optional)</span>
          </label>
          <Textarea
            id="resolution-note"
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={
              status === 'resolved'
                ? 'How was it fixed? Verified by whom?'
                : 'Why is this being dismissed?'
            }
            disabled={isPending}
          />
        </div>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success && !dirty ? (
        <Alert variant="success">Status updated.</Alert>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={isPending || !dirty}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {isPending ? 'Saving…' : 'Update status'}
      </Button>
    </div>
  )
}
