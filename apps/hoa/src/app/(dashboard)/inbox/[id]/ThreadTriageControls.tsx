'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Clock, RotateCcw } from 'lucide-react'
import { Alert, Button, Select } from '@homeowner-portal/ui'
import { setThreadStatus } from '@/lib/inbox/actions'
import { assignThread } from '@/lib/inbox/assign'
import type { Assignee } from '@/lib/inbox/assignees'

/**
 * Thread header controls (BL-101 A3 + A6): Close / Waiting / Reopen through
 * the existing `setThreadStatus`, and an assignee picker over
 * `inbox_threads.assigned_to`. Closing moves on to the next thread that
 * needs a reply, the same as "Approve and send".
 */
export function ThreadTriageControls({
  threadId,
  status,
  assignedTo,
  assignees,
  currentUserId,
  afterCloseHref,
}: {
  threadId: string
  status: string
  assignedTo: string | null
  assignees: Assignee[]
  currentUserId: string | null
  afterCloseHref: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function changeStatus(next: 'closed' | 'waiting' | 'needs_review') {
    setError(null)
    startTransition(async () => {
      const form = new FormData()
      form.set('threadId', threadId)
      form.set('status', next)
      const result = await setThreadStatus({}, form)
      if (result.error) {
        setError(result.error)
        return
      }
      if (next === 'closed') router.push(afterCloseHref)
    })
  }

  function changeAssignee(value: string) {
    setError(null)
    startTransition(async () => {
      const result = await assignThread(threadId, value || null)
      if ('error' in result) setError(result.error)
    })
  }

  // An assignee who has since left the board still shows, so the picker
  // never silently claims the thread is unassigned.
  const options = [
    { value: '', label: 'Unassigned' },
    ...assignees.map((a) => ({ value: a.userId, label: a.userId === currentUserId ? `${a.name} (you)` : a.name })),
    ...(assignedTo && !assignees.some((a) => a.userId === assignedTo)
      ? [{ value: assignedTo, label: 'Former board member' }]
      : []),
  ]

  const closed = status === 'closed'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-44">
        <Select
          value={assignedTo ?? ''}
          onValueChange={changeAssignee}
          disabled={pending}
          options={options}
          placeholder="Assign to…"
        />
      </div>
      {!closed ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={pending}
          icon={<Archive aria-hidden />}
          onClick={() => changeStatus('closed')}
        >
          Close
        </Button>
      ) : null}
      {!closed && status !== 'waiting' ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          icon={<Clock aria-hidden />}
          onClick={() => changeStatus('waiting')}
        >
          Waiting
        </Button>
      ) : null}
      {closed || status === 'waiting' ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={pending}
          icon={<RotateCcw aria-hidden />}
          onClick={() => changeStatus('needs_review')}
        >
          Reopen
        </Button>
      ) : null}
      {error ? (
        <Alert variant="error" className="w-full">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
