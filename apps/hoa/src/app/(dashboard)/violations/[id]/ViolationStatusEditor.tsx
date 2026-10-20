'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Alert, Button, Field, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { updateViolationStatus } from '@/lib/violations'
import { selectableViolationStatuses, type ViolationStatus } from '@/lib/violation-statuses'
import { VIOLATION_STATUS } from '@/lib/status/community'
import { StateLawCheckPanel } from '@/components/compliance/StateLawCheckPanel'
import { resolveOverrides, type DriftCheck, type DriftCode, type OverrideReason } from '@/lib/compliance/statute-drift'

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
  /** CA § 5855(c)(2): why moving to Fined is blocked, or null. The server
   *  action refuses it either way; this only says so up front. */
  fineBlockedReason?: string | null
  /** BL-130: the state law check on this violation's fine, or null when it
   *  could not be run or the violation is already fined. The server action
   *  re-runs it and refuses a block without the board's override reason. */
  lawCheck?: DriftCheck | null
}

export function ViolationStatusEditor({ violationId, currentStatus, currentResolutionNote, fineBlockedReason = null, lawCheck = null }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<ViolationStatus>(currentStatus)
  const [resolutionNote, setResolutionNote] = useState(currentResolutionNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [lawOverrides, setLawOverrides] = useState<Partial<Record<DriftCode, OverrideReason>>>({})

  const closingState = status === 'resolved' || status === 'dismissed'
  const fining = status === 'fined' && currentStatus !== 'fined'
  const fineBlocked = fining && fineBlockedReason !== null
  const lawBlocked = fining && lawCheck !== null && !resolveOverrides(lawCheck, lawOverrides as Record<string, string>).ok
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
        lawOverrides: fining ? lawOverrides : undefined,
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
          {selectableViolationStatuses(currentStatus).map((s) => (
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

      {fineBlocked ? <Alert variant="warning">{fineBlockedReason}</Alert> : null}

      {fining && lawCheck ? (
        <StateLawCheckPanel
          check={lawCheck}
          overrides={lawOverrides}
          disabled={isPending}
          onOverride={(code, reason) =>
            setLawOverrides((prev) => {
              const next = { ...prev }
              if (reason) next[code as DriftCode] = reason
              else delete next[code as DriftCode]
              return next
            })
          }
        />
      ) : null}
      {fieldErrors.lawOverride ? <Alert variant="error">{fieldErrors.lawOverride}</Alert> : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button type="submit" className="w-full" loading={isPending} disabled={!dirty || fineBlocked || lawBlocked} icon={<Check aria-hidden />}>
        {isPending ? 'Saving…' : 'Update status'}
      </Button>
    </form>
  )
}
