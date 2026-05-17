import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Shield } from 'lucide-react'
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
  type ViolationReportStatus,
} from '@/lib/board-review'
import { ReportDecisionForm } from './ReportDecisionForm'

export const metadata = { title: 'Resident violation report' }

const STATUS_VARIANT: Record<ViolationReportStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
  under_review: 'warning',
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
          . Per Policy §12.03, do not disclose the reporter's identity to the
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

      <Card variant="elevated">
        <CardHeader>
          <CardTitle className="text-base">Decision</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportDecisionForm
            reportId={report.id}
            currentNote={report.board_note}
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
