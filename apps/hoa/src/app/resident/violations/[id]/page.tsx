import { notFound } from 'next/navigation'
import { Badge, KeyValue, KeyValueList, LoadFailed } from '@homeowner-portal/ui'
import { getMyViolationReport } from '@/lib/resident-submissions'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { Panel, ScreenHeader, Section } from '@/components/resident/screen'
import { REPORT_CATEGORY_LABEL, ResidentStatus, residentStatusLabel } from '@/components/resident/status'
import { Conversation, ThreadClosed } from '@/components/resident/Conversation'
import { ReplyComposer } from '@/components/resident/ReplyComposer'
import { loadMyHomeViolation } from '@/lib/violation-response-load'
import { HomeViolationView } from './HomeViolationView'
import { formatDateTime } from '@/lib/format-datetime'

export const metadata = { title: 'Violation' }
export const dynamic = 'force-dynamic'

// The board has finished with a concern once it's closed or dismissed —
// the thread then becomes read-only.
const CLOSED = new Set(['closed_no_action', 'dismissed'])

export default async function ResidentViolationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // One route, two records: a concern this resident reported (keyed by
  // report id), or — BL-129 — a violation on their own home (keyed by
  // violation id). Ids are UUIDs, so they never collide.
  const report = await getMyViolationReport(id)
  if (!report) {
    const home = await loadMyHomeViolation(id)
    if (!home.ok) {
      if (home.reason === 'error') return <LoadFailed what="this notice" retryHref={`/resident/violations/${id}`} />
      notFound()
    }
    const attachments = home.thread ? await listSubmissionAttachments('ticket', home.thread.ticketId) : []
    return (
      <HomeViolationView
        violation={home.violation}
        thread={home.thread}
        threadFailed={home.threadFailed}
        canRespond={home.canRespond}
        attachments={attachments}
        hearing={home.hearing}
      />
    )
  }
  const attachments = await listSubmissionAttachments('concern', id)

  const closed = CLOSED.has(report.status)
  const category = REPORT_CATEGORY_LABEL[report.category] ?? report.category

  return (
    <div className="space-y-8">
      <ScreenHeader
        back={{ href: '/resident/violations', label: 'Reported concerns' }}
        title={`${category} concern`}
        meta={
          <>
            <ResidentStatus kind="report" status={report.status} />
            <Badge variant="neutral" size="sm">
              {category}
            </Badge>
          </>
        }
      />

      <Section label="What you reported">
        <Panel className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">{report.description}</p>
          <KeyValueList className="border-t border-border pt-4">
            <KeyValue label="Location" value={report.about_address} />
            <KeyValue label="Reported" value={formatDateTime(report.submitted_at)} />
            <KeyValue
              label="When it happened"
              value={report.occurred_at ? formatDateTime(report.occurred_at) : null}
            />
          </KeyValueList>
        </Panel>
      </Section>

      <Section label="Conversation">
        <Panel className="space-y-4">
          <Conversation
            messages={report.messages}
            emptyText="No messages yet. The board will follow up here if they need more information."
          />
          {closed ? (
            <ThreadClosed>
              This concern was {residentStatusLabel('report', report.status).toLowerCase()}. If the issue
              continues, report it again.
            </ThreadClosed>
          ) : (
            <div className="border-t border-border pt-4">
              <ReplyComposer kind="concern" id={report.id} placeholder="Add details or reply to the board…" />
            </div>
          )}
        </Panel>
      </Section>

      <Section label="Photos & documents">
        <Panel>
          <SubmissionAttachments threadType="concern" parentId={report.id} attachments={attachments} />
        </Panel>
      </Section>
    </div>
  )
}
