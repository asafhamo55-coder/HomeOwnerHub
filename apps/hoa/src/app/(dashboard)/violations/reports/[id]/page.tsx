import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  Page,
  StatusBadge,
} from '@homeowner-portal/ui'
import { getResidentViolationReportForBoard, getViolationReportMessagesForBoard } from '@/lib/board-review'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { BoardConversation } from '@/components/board-review/BoardConversation'
import { VIOLATION_REPORT_CATEGORY, VIOLATION_REPORT_STATUS } from '@/lib/status/community'
import { ReportDecisionForm } from './ReportDecisionForm'
import { ReportBoardReplyForm } from './ReportBoardReplyForm'
import { formatDateTime, formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Resident violation report' }
// Force a fresh render after a board decision so the status reflects the
// write immediately (see the note in ../../arc/[id]/page.tsx).
export const dynamic = 'force-dynamic'

export default async function ViolationReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const report = await getResidentViolationReportForBoard(id)
  if (!report) notFound()
  const [messages, attachments] = await Promise.all([
    getViolationReportMessagesForBoard(id),
    listSubmissionAttachments('concern', id),
  ])

  const category = VIOLATION_REPORT_CATEGORY[report.category] ?? report.category
  const title = report.about_address ?? 'No address given'

  return (
    <Page
      width="wide"
      title={title}
      breadcrumbs={[
        { label: 'Violations', href: '/violations' },
        { label: 'Resident reports', href: '/violations/reports' },
        { label: title },
      ]}
      linkAs={Link}
      meta={
        <>
          <StatusBadge status={report.status} tones={VIOLATION_REPORT_STATUS.tones} labels={VIOLATION_REPORT_STATUS.labels} />
          <Badge variant="neutral">{category}</Badge>
        </>
      }
      description={
        <>
          Submitted <time dateTime={report.submitted_at}>{formatShortDate(report.submitted_at)}</time>
          {report.about_unit_number ? ` · Unit ${report.about_unit_number}` : ''}
        </>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">What they observed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{report.description}</p>
              <KeyValueList className="border-t border-border pt-4 sm:grid-cols-3">
                <KeyValue
                  label="Occurred"
                  value={report.occurred_at ? formatDateTime(report.occurred_at) : null}
                />
                <KeyValue label="Category" value={category} />
                <KeyValue
                  label="Formal violation"
                  value={
                    report.hoa_violation_id ? (
                      <Link href={`/violations/${report.hoa_violation_id}`} className="font-medium text-primary">
                        View violation
                      </Link>
                    ) : null
                  }
                />
              </KeyValueList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Conversation with the reporter</CardTitle>
              <CardDescription>Replies go to the reporter&apos;s portal. Internal notes stay with the board.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <BoardConversation
                messages={messages}
                residentLabel="Reporter"
                emptyHint="No messages yet. Ask the reporter for a photo or more detail if you need it."
              />
              <div className="border-t border-border pt-5">
                <ReportBoardReplyForm reportId={report.id} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Documents</CardTitle>
              <CardDescription>Photos and files the reporter or board attached.</CardDescription>
            </CardHeader>
            <CardContent>
              <SubmissionAttachments threadType="concern" parentId={report.id} attachments={attachments} canDelete />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          <Alert variant="warning" title="Reporter identity — board only">
            <p>
                Submitted by{' '}
                <strong className="font-semibold text-foreground">
                  {report.reporter_name ?? report.reporter_email ?? 'an unknown user'}
                </strong>
                . Residents were told their identity is kept confidential where possible, so don&apos;t share the reporter&apos;s name with the subject of the report or other residents.
            </p>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Decision</CardTitle>
              <CardDescription>
                {report.reviewed_at ? (
                  <>
                    Last reviewed <time dateTime={report.reviewed_at}>{formatDateTime(report.reviewed_at)}</time>
                  </>
                ) : (
                  'Not reviewed yet.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReportDecisionForm reportId={report.id} currentNote={report.board_note} currentStatus={report.status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  )
}
