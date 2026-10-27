'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert, Button, Field, Select, Textarea, useToast } from '@homeowner-portal/ui'
import { recordConflictDisclosure } from '@/lib/conflict-disclosure/actions'
import { NOTE_MAX, STATUS_LABEL, type DecisionKind, type DisclosureStatus } from '@/lib/conflict-disclosure/model'

export interface DisclosureMemberOption {
  userId: string
  name: string
}

/** BL-165: record one board member's answer for this decision. */
export function DisclosureForm({
  decisionKind,
  decisionId,
  members,
  defaultMemberId,
}: {
  decisionKind: DecisionKind
  decisionId: string
  /** Who the caller may record for: just themselves, or any board member for an admin. */
  members: DisclosureMemberOption[]
  defaultMemberId: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [memberId, setMemberId] = useState(defaultMemberId)
  const [status, setStatus] = useState<DisclosureStatus>('no_conflict')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | undefined>()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNoteError(undefined)
    startTransition(async () => {
      const r = await recordConflictDisclosure({ decisionKind, decisionId, memberId, status, note })
      if (!r.ok) {
        if (r.field === 'note') setNoteError(r.error)
        else setError(r.error)
        return
      }
      toast({ tone: 'success', message: 'Disclosure recorded.' })
      setNote('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {error ? <Alert variant="error" title="Couldn’t record the disclosure">{error}</Alert> : null}
      {members.length > 1 ? (
        <Field label="Board member" required>
          <Select value={memberId} onValueChange={setMemberId}>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Disclosure" required>
        <Select value={status} onValueChange={(v) => setStatus(v as DisclosureStatus)}>
          <option value="no_conflict">{STATUS_LABEL.no_conflict}</option>
          <option value="conflict_recused">{STATUS_LABEL.conflict_recused}</option>
        </Select>
      </Field>
      <Field
        label="Note"
        required={status === 'conflict_recused'}
        hint="Short and plain. It is kept on the decision record, not in the audit trail."
        error={noteError}
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={NOTE_MAX} />
      </Field>
      <Button type="submit" loading={pending}>
        Record disclosure
      </Button>
    </form>
  )
}
