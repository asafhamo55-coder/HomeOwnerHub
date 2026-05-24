'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as TicketStatus
    setError(null)
    startTransition(async () => {
      const result = await updateTicketStatus(ticketId, status)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  function handlePriorityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const priority = e.target.value as TicketPriority
    setError(null)
    startTransition(async () => {
      const result = await updateTicketPriority(ticketId, priority)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Status</span>
        <select
          value={currentStatus}
          onChange={handleStatusChange}
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Priority</span>
        <select
          value={currentPriority}
          onChange={handlePriorityChange}
          disabled={isPending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </label>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
