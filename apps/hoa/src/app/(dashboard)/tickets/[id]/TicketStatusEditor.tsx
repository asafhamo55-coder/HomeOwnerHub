'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@homeowner-portal/ui'
import { updateTicketStatus, updateTicketPriority, type TicketStatus, type TicketPriority } from '@/lib/tickets'

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
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(status: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateTicketStatus(ticketId, status as TicketStatus)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  function handlePriorityChange(priority: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateTicketPriority(ticketId, priority as TicketPriority)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Status</span>
        <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </Select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Priority</span>
        <Select value={currentPriority} onValueChange={handlePriorityChange} disabled={isPending}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
      </label>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
