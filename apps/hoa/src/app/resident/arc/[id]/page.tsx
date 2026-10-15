import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { Gavel } from 'lucide-react'
import { Badge, KeyValue, KeyValueList } from '@homeowner-portal/ui'
import { getMyArcRequest, type ArcStatus } from '@/lib/resident-submissions'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { Hero, Panel, ScreenHeader, Section } from '@/components/resident/screen'
import { ARC_CATEGORY_LABEL, ResidentStatus, residentStatusLabel } from '@/components/resident/status'
import { Conversation, ThreadClosed } from '@/components/resident/Conversation'
import { ReplyComposer } from '@/components/resident/ReplyComposer'
import { WithdrawArcButton } from './WithdrawArcButton'

export const metadata = { title: 'ARC application' }
export const dynamic = 'force-dynamic'

// A resident can still discuss and withdraw while the board is deciding.
// Once a decision lands (or they withdraw), the thread is read-only.
const PENDING: ArcStatus[] = ['submitted', 'in_review']

export default async function ResidentArcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const arc = await getMyArcRequest(id)
  if (!arc) notFound()
  const attachments = await listSubmissionAttachments('arc', id)

  const pending = PENDING.includes(arc.status)
  const fmt = (d: string | null) => (d ? format(new Date(d), 'PP') : null)

  return (
    <div className="space-y-8">
      <ScreenHeader
        back={{ href: '/resident/arc', label: 'ARC applications' }}
        title={arc.summary}
        meta={
          <>
            <ResidentStatus kind="arc" status={arc.status} />
            <Badge variant="neutral" size="sm">
              {ARC_CATEGORY_LABEL[arc.category] ?? arc.category}
            </Badge>
          </>
        }
      />

      {arc.board_response ? (
        <Hero
          tone={arc.status === 'approved' ? 'success' : arc.status === 'denied' ? 'danger' : 'neutral'}
          icon={<Gavel />}
          eyebrow={`Board decision${arc.board_response_at ? ` · ${fmt(arc.board_response_at)}` : ''}`}
          description={<span className="whitespace-pre-wrap text-foreground">{arc.board_response}</span>}
        />
      ) : null}

      <Section label="What you asked for">
        <Panel className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">
            {arc.scope_description}
          </p>
          <KeyValueList className="border-t border-border pt-4">
            <KeyValue label="Proposed start" value={fmt(arc.proposed_start)} />
            <KeyValue label="Proposed completion" value={fmt(arc.proposed_completion)} />
            <KeyValue label="Contractor" value={arc.contractor_name} />
            <KeyValue label="License #" value={arc.contractor_license} />
            <KeyValue label="Submitted" value={format(new Date(arc.submitted_at), 'PPp')} />
          </KeyValueList>
        </Panel>
      </Section>

      <Section label="Conversation">
        <Panel className="space-y-4">
          <Conversation
            messages={arc.messages}
            emptyText="No messages yet. Ask a question below and the board will reply here."
          />
          {pending ? (
            <div className="border-t border-border pt-4">
              <ReplyComposer kind="arc" id={arc.id} placeholder="Ask a question or add details for the board…" />
            </div>
          ) : (
            <ThreadClosed>
              This application is {residentStatusLabel('arc', arc.status).toLowerCase()}. To propose a new
              change, start a new application.
            </ThreadClosed>
          )}
        </Panel>
      </Section>

      <Section label="Documents">
        <Panel>
          <SubmissionAttachments threadType="arc" parentId={arc.id} attachments={attachments} />
        </Panel>
      </Section>

      {pending ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Changed your mind? You can withdraw while the board is still reviewing.
          </p>
          <WithdrawArcButton arcId={arc.id} />
        </Panel>
      ) : null}
    </div>
  )
}
