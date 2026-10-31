import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { formatDay } from '@/lib/money/format'
import { CheckCircle2, Circle, Clock, Gavel, Send, Undo2, XCircle } from 'lucide-react'
import { Badge, KeyValue, KeyValueList, Timeline, type TimelineItem } from '@homeowner-portal/ui'
import { arcTimelineSteps, type ArcStepKind } from '@/lib/resident-arc-timeline'
import { getMyArcRequest, type ArcStatus } from '@/lib/resident-submissions'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { Hero, Panel, ScreenHeader, Section } from '@/components/resident/screen'
import { ARC_CATEGORY_LABEL, ResidentStatus, residentStatusLabel } from '@/components/resident/status'
import { Conversation, ThreadClosed } from '@/components/resident/Conversation'
import { ReplyComposer } from '@/components/resident/ReplyComposer'
import { WithdrawArcButton } from './WithdrawArcButton'
import { formatDateTime, formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'ARC application' }
export const dynamic = 'force-dynamic'

// A resident can still discuss and withdraw while the board is deciding.
// Once a decision lands (or they withdraw), the thread is read-only.
const PENDING: ArcStatus[] = ['submitted', 'in_review']

const STEP_ICON: Record<ArcStepKind, ReactNode> = {
  submitted: <Send />,
  in_review: <Clock />,
  decision: <Circle />,
  approved: <CheckCircle2 />,
  denied: <XCircle />,
  withdrawn: <Undo2 />,
}
const STEP_TONE: Record<string, TimelineItem['tone']> = { approved: 'success', denied: 'danger' }

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
  const fmt = (d: string | null) => (d ? formatShortDate(d) : null)
  // proposed_start/proposed_completion are DATE columns: calendar days, not instants.
  const day = (d: string | null) => (d ? formatDay(d) : null)

  const steps: TimelineItem[] = arcTimelineSteps(arc).map((st) => ({
    id: st.id,
    title: <span className={st.state === 'upcoming' ? 'text-muted' : undefined}>{st.label}</span>,
    meta: st.state === 'current' ? 'Now' : undefined,
    time: st.at ? <time dateTime={st.at}>{formatShortDate(st.at)}</time> : undefined,
    icon: STEP_ICON[st.id],
    tone: st.state === 'upcoming' ? 'neutral' : st.state === 'current' ? (STEP_TONE[st.id] ?? 'brand') : 'success',
  }))

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

      <Panel className="py-3">
        <Timeline items={steps} label="Application progress" className="space-y-3" />
      </Panel>

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
            <KeyValue label="Proposed start" value={day(arc.proposed_start)} />
            <KeyValue label="Proposed completion" value={day(arc.proposed_completion)} />
            <KeyValue label="Contractor" value={arc.contractor_name} />
            <KeyValue label="License #" value={arc.contractor_license} />
            <KeyValue label="Submitted" value={formatDateTime(arc.submitted_at)} />
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
