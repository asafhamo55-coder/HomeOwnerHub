import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import {
  BackLink,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@homeowner-portal/ui'
import { getMyViolationReport } from '@/lib/resident-submissions'
import { ViolationReplyForm } from './ViolationReplyForm'

export const metadata = { title: 'Reported concern' }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'outline',
  under_review: 'warning',
  opened_as_violation: 'default',
  closed_no_action: 'success',
  dismissed: 'outline',
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  opened_as_violation: 'Action taken',
  closed_no_action: 'Closed',
  dismissed: 'Dismissed',
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

// The board has finished with a concern once it's closed or dismissed —
// the thread then becomes read-only.
const CLOSED = new Set(['closed_no_action', 'dismissed'])

export default async function ResidentViolationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const report = await getMyViolationReport(id)
  if (!report) notFound()

  const closed = CLOSED.has(report.status)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/resident/violations" label="Back to my concerns" />

      <PageHeader
        title={`${CATEGORY_LABEL[report.category] ?? report.category} concern`}
        actions={
          <Badge variant={STATUS_VARIANT[report.status] ?? 'outline'} size="sm">
            {STATUS_LABEL[report.status] ?? report.status.replace(/_/g, ' ')}
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you reported</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {report.about_address ? (
            <p className="text-xs text-muted">Location: {report.about_address}</p>
          ) : null}
          <p className="whitespace-pre-wrap">{report.description}</p>
          <p className="text-xs text-muted">
            Reported {format(new Date(report.submitted_at), 'PPp')}
            {report.occurred_at
              ? ` · occurred ${format(new Date(report.occurred_at), 'PPp')}`
              : ''}
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
          {report.messages.length === 0 ? (
            <p className="text-sm text-muted">
              No messages yet. The board will follow up here if they need more
              information.
            </p>
          ) : (
            <ul className="space-y-4">
              {report.messages.map((m) => (
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
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {closed ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-center text-sm text-muted">
              This concern has been {STATUS_LABEL[report.status]?.toLowerCase() ?? 'closed'}.
              If the issue continues, report it again.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a message</CardTitle>
          </CardHeader>
          <CardContent>
            <ViolationReplyForm reportId={report.id} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
