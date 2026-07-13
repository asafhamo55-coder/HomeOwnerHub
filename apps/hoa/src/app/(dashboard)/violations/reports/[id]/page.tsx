import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MessageSquare, Shield } from 'lucide-react'
import { format } from 'date-fns'
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import {
  getResidentViolationReportForBoard,
  getViolationReportMessagesForBoard,
  type ViolationReportStatus,
} from '@/lib/board-review'
import { ReportDecisionForm } from './ReportDecisionForm'
import { ReportBoardReplyForm } from './ReportBoardReplyForm'

export const metadata = { title: 'Resident violation report' }
// Force a fresh render after a board decision so the status reflects the
// write immediately (see the note in ../../arc/[id]/page.tsx).
export const dynamic = 'force-dynamic'

const STATUS_VARIANT: Record<ViolationReportStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
  under_review: 'default',
  opened_as_violation: 'destructive',
  closed_no_action: 'outline',
  dismissed: 'outline',
}

const CATEGORY_LABEL: Record<string, string> = {
  parking: 'Parking',
  pet: 'Pet',
  noise: 'Noise',
  lawn_landscape: 'Lawn / landscape',
  trash: 'Trash',
  architectural: 'Architectural',
  rental: 'Rental',
  nuisance: 'Nuisance',
  other: 'Other',
}

export default async function ViolationReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const report = await getResidentViolationReportForBoard(id)
  if (!report) notFound()
  const messages = await getViolationReportMessagesForBoard(id)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/violations/reports"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to reports
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {report.about_address ?? '(no address)'}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {format(new Date(report.submitted_at), 'PP')}
            {report.occurred_at
              ? ` · occurred ${format(new Date(report.occurred_at), 'PPp')}`
              : ''}
            {report.about_unit_number ? ` · unit ${report.about_unit_number}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CATEGORY_LABEL[report.category] ?? report.category}</Badge>
          <Badge variant={STATUS_VARIANT[report.status]}>
            {report.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </header>

      <Alert variant="info" title="Reporter identity — board-only">
        <span className="block text-sm">
          <Shield className="mr-1 inline h-3.5 w-3.5" />
          This report was submitted by{' '}
          <strong>
            {report.reporter_name ?? report.reporter_email ?? '(unknown user)'}
          </strong>
          . Per Policy Section 12.03, do not disclose the reporter's identity to the
          subject of the report or other residents.
        </span>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What they observed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{report.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversation with reporter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted">
              No messages yet. Replies you send here are visible to the reporter;
              internal notes are not.
            </p>
          ) : (
            <ul className="space-y-4">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={
                    m.internal
                      ? 'space-y-1 rounded-md border border-dashed border-warning/40 bg-warning/5 p-2'
                      : 'space-y-1'
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {m.author_role === 'resident' ? 'Reporter' : 'Board'}
                    </span>
                    <Badge
                      variant={m.author_role === 'resident' ? 'outline' : 'default'}
                      size="sm"
                    >
                      {m.author_role}
                    </Badge>
                    {m.internal ? (
                      <Badge variant="warning" size="sm">
                        internal
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted">
                      {format(new Date(m.created_at), 'PPp')}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border pt-4">
            <ReportBoardReplyForm reportId={report.id} />
          </div>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle className="text-base">Decision</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDecisionForm
            reportId={report.id}
            currentNote={report.board_note}
            currentStatus={report.status}
          />
        </CardContent>
      </Card>

      {report.reviewed_at ? (
        <p className="text-xs text-muted">
          Reviewed {format(new Date(report.reviewed_at), 'PPp')}
        </p>
      ) : null}
    </div>
  )
}
