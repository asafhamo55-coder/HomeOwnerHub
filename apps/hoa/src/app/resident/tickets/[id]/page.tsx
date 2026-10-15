import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { Badge, KeyValue, KeyValueList } from '@homeowner-portal/ui'
import { getMyTicket } from '@/lib/resident-tickets'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { Panel, ScreenHeader, Section } from '@/components/resident/screen'
import { ResidentStatus, TICKET_CATEGORY_LABEL } from '@/components/resident/status'
import { Conversation, ThreadClosed } from '@/components/resident/Conversation'
import { ReplyComposer } from '@/components/resident/ReplyComposer'

export const metadata = { title: 'Support request' }
export const dynamic = 'force-dynamic'

export default async function ResidentTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ticket = await getMyTicket(id)
  if (!ticket) notFound()
  const attachments = await listSubmissionAttachments('ticket', id)

  return (
    <div className="space-y-8">
      <ScreenHeader
        back={{ href: '/resident/tickets', label: 'Support requests' }}
        title={ticket.subject}
        meta={
          <>
            <ResidentStatus kind="ticket" status={ticket.status} />
            <Badge variant="neutral" size="sm">
              {TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category}
            </Badge>
          </>
        }
      />

      <Section label="Details">
        <Panel className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">{ticket.description}</p>
          <KeyValueList className="border-t border-border pt-4">
            <KeyValue label="Opened" value={format(new Date(ticket.created_at), 'PPp')} />
            <KeyValue label="Closed" value={ticket.closed_at ? format(new Date(ticket.closed_at), 'PPp') : null} />
          </KeyValueList>
        </Panel>
      </Section>

      <Section label="Conversation">
        <Panel className="space-y-4">
          <Conversation
            messages={ticket.messages}
            emptyText="No messages yet. The board will reply here."
          />
          {ticket.status !== 'closed' ? (
            <div className="border-t border-border pt-4">
              <ReplyComposer kind="ticket" id={ticket.id} placeholder="Write a reply…" />
            </div>
          ) : (
            <ThreadClosed>This request is closed. If you need more help, open a new request.</ThreadClosed>
          )}
        </Panel>
      </Section>

      <Section label="Documents">
        <Panel>
          <SubmissionAttachments threadType="ticket" parentId={ticket.id} attachments={attachments} />
        </Panel>
      </Section>
    </div>
  )
}

