'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteTicket } from '@/lib/tickets'

export function TicketActions({ ticketId }: { ticketId: string }) {
  const router = useRouter()

  return (
    <TwoClickDelete
      onDelete={() => deleteTicket(ticketId)}
      onAfterDelete={() => router.push('/tickets')}
    />
  )
}
