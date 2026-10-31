import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, Lock, MessageSquare, Paperclip, User } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  Page,
  StatusBadge,
  Timeline,
  type TimelineItem,
} from '@homeowner-portal/ui'
import { getTicketForBoard, listTicketActionItems } from '@/lib/tickets'
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS } from '@/lib/status/community'
import { TicketReplyForm } from './TicketReplyForm'
import { TicketStatusEditor } from './TicketStatusEditor'
import { TicketActionItems } from './TicketActionItems'
import { TicketActions } from './TicketActions'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { formatDateTime, formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Ticket' }
// Fresh render after a status/priority change so the board sees it apply
// immediately (see the note in ../../arc/[id]/page.tsx).
export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  resident: 'Resident',
  board: 'Board',
  admin: 'Admin',
}

function when(iso: string) {
  return <time dateTime={iso}>{formatDateTime(iso)}</time>
}

export default async function BoardTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [ticket, actionItems, attachments] = await Promise.all([
    getTicketForBoard(id),
    listTicketActionItems(id),
    listSubmissionAttachments('ticket', id),
  ])
  if (!ticket) notFound()

  const submitter = ticket.submitter_name ?? ticket.submitter_email ?? 'Unknown resident'

  // The opening request is the first entry; replies and notes follow.
  const timeline: TimelineItem[] = [
    {
      id: 'opened',
      title: submitter,
      meta: 'opened this ticket',
      time: when(ticket.created_at),
      icon: <User aria-hidden />,
      tone: 'brand',
      body: <p className="whitespace-pre-wrap text-foreground">{ticket.description}</p>,
    },
    ...ticket.messages.map<TimelineItem>((m) => ({
      id: m.id,
      title: m.author_name ?? 'Unknown',
      meta: m.internal
        ? `${ROLE_LABEL[m.author_role] ?? m.author_role} · internal note`
        : ROLE_LABEL[m.author_role] ?? m.author_role,
      time: when(m.created_at),
      icon: m.internal ? <Lock aria-hidden /> : <MessageSquare aria-hidden />,
      tone: m.internal ? 'warning' : m.author_role === 'resident' ? 'neutral' : 'info',
      highlight: m.internal,
      body: <p className="whitespace-pre-wrap text-foreground">{m.body}</p>,
    })),
  ]
  if (ticket.closed_at) {
    timeline.push({
      id: 'closed',
      title: 'Ticket closed',
      time: when(ticket.closed_at),
      tone: 'success',
    })
  }

  return (
    <Page
      width="wide"
      linkAs={Link}
      breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: ticket.subject }]}
      title={ticket.subject}
      meta={
        <>
          <StatusBadge status={ticket.status} tones={TICKET_STATUS.tones} labels={TICKET_STATUS.labels} />
          <StatusBadge status={ticket.priority} tones={TICKET_PRIORITY.tones} labels={TICKET_PRIORITY.labels} />
        </>
      }
      description={
        <>
          {submitter}
          {ticket.unit_number ? ` · Unit ${ticket.unit_number}` : ''} · opened{' '}
          {formatShortDate(ticket.created_at)}
        </>
      }
      actions={<TicketActions ticketId={ticket.id} subject={ticket.subject} />}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Conversation</CardTitle>
              <CardDescription>
                {ticket.messages.length === 0
                  ? 'No replies yet — the resident is waiting on the board.'
                  : `${ticket.messages.length} ${ticket.messages.length === 1 ? 'reply' : 'replies'}. Internal notes are highlighted and never shown to the resident.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Timeline items={timeline} label="Ticket conversation" />
              <div className="border-t border-border pt-5">
                <TicketReplyForm ticketId={ticket.id} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Paperclip className="size-4 text-muted" aria-hidden />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SubmissionAttachments
                threadType="ticket"
                parentId={ticket.id}
                attachments={attachments}
                canDelete
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <KeyValueList className="sm:grid-cols-2 lg:grid-cols-1">
                <KeyValue label="Category" value={TICKET_CATEGORY[ticket.category] ?? ticket.category} />
                <KeyValue label="Unit" value={ticket.unit_number} />
                <KeyValue label="Submitted by" value={submitter} />
                <KeyValue
                  label="Closed"
                  value={ticket.closed_at ? formatShortDate(ticket.closed_at) : null}
                />
              </KeyValueList>
              <div className="border-t border-border pt-5">
                <TicketStatusEditor
                  ticketId={ticket.id}
                  currentStatus={ticket.status}
                  currentPriority={ticket.priority}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <ClipboardList className="size-4 text-muted" aria-hidden />
                Action items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TicketActionItems ticketId={ticket.id} items={actionItems} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  )
}
