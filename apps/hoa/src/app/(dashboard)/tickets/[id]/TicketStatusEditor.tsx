'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Field, Select, useToast } from '@homeowner-portal/ui'
import { updateTicketStatus, updateTicketPriority, type TicketStatus, type TicketPriority } from '@/lib/tickets'
import { TICKET_PRIORITY, TICKET_STATUS } from '@/lib/status/community'

/** Status + priority. Each change saves immediately (no submit button). */
export function TicketStatusEditor({
  ticketId,
  currentStatus,
  currentPriority,
}: {
  ticketId: string
  currentStatus: TicketStatus
  currentPriority: TicketPriority
}) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<{ status?: string; priority?: string }>({})

  function handleStatusChange(status: string) {
    setError({})
    startTransition(async () => {
      const result = await updateTicketStatus(ticketId, status as TicketStatus)
      if (!result.ok) setError({ status: result.error })
      else {
        toast({ tone: 'success', message: `Status set to ${TICKET_STATUS.labels[status] ?? status}.` })
        router.refresh()
      }
    })
  }

  function handlePriorityChange(priority: string) {
    setError({})
    startTransition(async () => {
      const result = await updateTicketPriority(ticketId, priority as TicketPriority)
      if (!result.ok) setError({ priority: result.error })
      else {
        toast({ tone: 'success', message: `Priority set to ${TICKET_PRIORITY.labels[priority] ?? priority}.` })
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      <Field label="Status" error={error.status} hint="Closing records who closed it and when.">
        <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
        </Select>
      </Field>
      <Field label="Priority" error={error.priority}>
        <Select value={currentPriority} onValueChange={handlePriorityChange} disabled={isPending}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </Field>
    </div>
  )
}
