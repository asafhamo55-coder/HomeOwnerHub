import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, MessageSquare, ClipboardList } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import {
  getTicketForBoard,
  listTicketActionItems,
  type TicketStatus,
  type TicketPriority,
} from '@/lib/tickets'
import { TicketReplyForm } from './TicketReplyForm'
import { TicketStatusEditor } from './TicketStatusEditor'
import { TicketActionItems } from './TicketActionItems'
import { TicketActions } from './TicketActions'

export const metadata = { title: 'Ticket' }

const STATUS_VARIANT: Record<TicketStatus, 'success' | 'warning' | 'outline'> = {
  open: 'outline',
  in_progress: 'warning',
  closed: 'success',
}

const PRIORITY_VARIANT: Record<TicketPriority, 'destructive' | 'warning' | 'outline' | 'default'> = {
  urgent: 'destructive',
  high: 'warning',
  normal: 'outline',
  low: 'default',
}

const CATEGORY_LABEL: Record<string, string> = {
  maintenance: 'Maintenance',
  noise: 'Noise',
  parking: 'Parking',
  common_area: 'Common area',
  billing: 'Billing',
  access: 'Access',
  safety: 'Safety',
  general: 'General',
  other: 'Other',
}

export default async function BoardTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [ticket, actionItems] = await Promise.all([
    getTicketForBoard(id),
    listTicketActionItems(id),
  ])
  if (!ticket) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Tickets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-muted">
            {ticket.submitter_name ?? ticket.submitter_email ?? 'Unknown'}
            {ticket.unit_number ? ` · Unit ${ticket.unit_number}` : ''}
            {' · '}
            {format(new Date(ticket.created_at), 'PPp')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={PRIORITY_VARIANT[ticket.priority]} size="sm">
            {ticket.priority}
          </Badge>
          <Badge variant={STATUS_VARIANT[ticket.status]} size="sm">
            {ticket.status.replace('_', ' ')}
          </Badge>
          <TicketActions ticketId={ticket.id} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
            <p className="mt-2 text-xs text-muted">
              Category: {CATEGORY_LABEL[ticket.category] ?? ticket.category}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketStatusEditor ticketId={ticket.id} currentStatus={ticket.status} currentPriority={ticket.priority} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticket.messages.length === 0 ? (
            <p className="text-sm text-muted">No messages yet.</p>
          ) : (
            <ul className="space-y-4">
              {ticket.messages.map((m) => (
                <li
                  key={m.id}
                  className={`space-y-1 rounded-md p-3 ${
                    m.internal
                      ? 'border border-dashed border-warning/40 bg-warning/5'
                      : 'bg-foreground/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {m.author_name ?? 'Unknown'}
                    </span>
                    <Badge
                      variant={m.author_role === 'resident' ? 'outline' : 'default'}
                      size="sm"
                    >
                      {m.author_role}
                    </Badge>
                    {m.internal ? (
                      <Badge variant="warning" size="sm">internal note</Badge>
                    ) : null}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reply</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketReplyForm ticketId={ticket.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Action Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TicketActionItems ticketId={ticket.id} items={actionItems} />
        </CardContent>
      </Card>
    </div>
  )
}
