'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteTicket } from '@/lib/tickets'

export function TicketActions({ ticketId, subject }: { ticketId: string; subject: string }) {
  const router = useRouter()
  const toast = useToast()

  return (
    <ConfirmDialog
      destructive
      title="Delete this ticket?"
      description={
        <>
          “{subject}” and its conversation disappear from the board’s list and from the
          resident’s portal. To finish a request without removing it, set its status to
          Closed instead.
        </>
      }
      confirmLabel="Delete ticket"
      onConfirm={async () => {
        const result = await deleteTicket(ticketId)
        if (!result.ok) {
          toast({ tone: 'error', message: result.error })
          throw new Error(result.error)
        }
        toast({ tone: 'success', message: 'Ticket deleted.' })
        router.push('/tickets')
      }}
      trigger={
        <Button variant="destructive-ghost" icon={<Trash2 aria-hidden />}>
          Delete
        </Button>
      }
    />
  )
}
