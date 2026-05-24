import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import { BackLink, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@homeowner-portal/ui'
import { getMyTicket, type TicketStatus } from '@/lib/resident-tickets'
import { ResidentTicketReplyForm } from './ResidentTicketReplyForm'

export const metadata = { title: 'Ticket' }

const STATUS_VARIANT: Record<TicketStatus, 'success' | 'warning' | 'outline'> = {
  open: 'outline',
  in_progress: 'warning',
  closed: 'success',
}

export default async function ResidentTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ticket = await getMyTicket(id)
  if (!ticket) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/resident/tickets" label="Back to my tickets" />

      <PageHeader
        title={ticket.subject}
        actions={
          <Badge variant={STATUS_VARIANT[ticket.status]} size="sm">
            {ticket.status.replace('_', ' ')}
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{ticket.description}</p>
          <p className="text-xs text-muted">
            Opened {format(new Date(ticket.created_at), 'PPp')}
            {ticket.closed_at
              ? ` · Closed ${format(new Date(ticket.closed_at), 'PPp')}`
              : null}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-muted">No messages yet. The board will respond here.</p>
          ) : (
            <ul className="space-y-4">
              {ticket.messages.map((m) => (
                <li key={m.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {m.author_role === 'resident' ? 'You' : 'Board'}
                    </span>
                    <Badge
                      variant={m.author_role === 'resident' ? 'outline' : 'default'}
                      size="sm"
                    >
                      {m.author_role}
                    </Badge>
                    <span className="text-xs text-muted">
                      {format(new Date(m.created_at), 'PPp')}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ticket.status !== 'closed' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reply</CardTitle>
          </CardHeader>
          <CardContent>
            <ResidentTicketReplyForm ticketId={ticket.id} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <p className="text-center text-sm text-muted">
              This ticket is closed. If you need further help, open a new ticket.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
